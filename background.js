
/*

  NOTES: HTTP Redirects to another hostname can be tricky as it is possible that the hostname (x-hdy-headers) isn't updated on time.
  It doesn't seem that we can detect HTTP redirect that easily - it seems imperative that the HTTP server handles and map that update himself.

*/

const RESOURCE_TYPE_CASE_COUNT = 5;
const LIVE_SESSIONS_RULES_COUNT = 4800;
const LIVE_SESSIONS_RULE_STARTING_ID = (1 + RESOURCE_TYPE_CASE_COUNT);

let BOOTED = false;

let HOODY_CONFIG = {
    DaemonWebSocketURL: 'wss://secure.hoody.local:17898/',
    ExtensionVersion: 1,
    ProfileID: '772a8ec5972664c2ee38aa66e6fe802d1b23fcccf91c164e01b1f1ea1f9abddb',
    BrowserID: 'JY98NT2BV49D0ST0',
    BrowserName: 'chromium',
    StartTime: Date.now()
};

var MAP_TABID_TO_HOSTNAME = {};
var MAP_TABID_TO_RULE_IDS = {};



/********************* */
/* TAB MANAGEMENT ******/
/********************* */


function UpdateLiveSessionTabID(TabID, TabHostname = null) {

        console.log('UpdateLiveSessionTabID()', TabID, TabHostname);
        
      if (!TabHostname) MAP_TABID_TO_HOSTNAME[TabID] = null;
      // The TabID isn't the one mapped in the hostname anymore, we update it.
      else MAP_TABID_TO_HOSTNAME[TabID] = TabHostname;
      
      // We then update the Live Rule as well so every sub resources will contain the hostname
      // This isn't guaranteed but we try to do it as much as possible as it drastically helps for the mapping on the Daemon side.
      let CurrentRuleIDs = MAP_TABID_TO_RULE_IDS[TabID];
      if (!CurrentRuleIDs) {
          console.log('UpdateLiveSessionTabID() FATAL => CurrentRuleIDs NOT FOUND', TabID, TabHostname, 'WHOLE ARRAY =>', MAP_TABID_TO_RULE_IDS)
          // This is really weird and shouldn't happen.
          return;
      }

      let StartingRuleID = CurrentRuleIDs[0];

      let Rules = GetLiveSessionModifyHeadersRuleObject(StartingRuleID, 1, TabID, TabHostname);
      
      return new Promise(function(resolve) {

          // Then we update the live session rules so sub-resources can contain the Tab Hostname and help the Daemon.
          chrome.declarativeNetRequest.updateSessionRules({
              addRules: Rules,
              removeRuleIds: CurrentRuleIDs,
          }, function(cb) {
                resolve(true);
          });

      });
}

async function OnTabCreated(TabInfo) {
    if (!BOOTED) return;

    let TabURL = TabInfo.url;
    if (TabURL.length == 0) {
        if (TabInfo.pendingUrl.length != 0) {
            TabURL = TabInfo.pendingUrl;
        }
        else return;
    }

    await MapTabIDToHostname(TabInfo.id, TabURL);
}

async function OnBeforeNavigate() {
    
}

async function OnTabClosed(TabID, RemoveInfo) {
    if (!BOOTED) return;
    // When a Tab get closed, we immediately remove the x-hdy-main-frame-host header to avoid the next load to use the wrong hostname.
    await UpdateLiveSessionTabID(TabID, null);
}

async function OnTabUpdate(TabID, ChangeInfo, TabInfo) {

    console.log('OnTabUpdate()', TabID, ChangeInfo, TabInfo);
    if (!BOOTED) return;
    if (ChangeInfo.url && ChangeInfo.status === 'loading') {
        // The tab just changed URL, it doesn't mean the domain changed, the next function is in charge of it
        await MapTabIDToHostname(TabID, ChangeInfo.url);
    }
}

async function MapTabIDToHostname(TabID, TabURL, TabHostname = null) {

    if (!TabHostname) {
        // http/https only
        if (TabURL.charAt(0) !== 'h') return;

        // We get the TabHostname from the URL
        TabHostname = new URL(TabURL).hostname;
        if (TabHostname.slice(0, 4) === 'www.') TabHostname = TabHostname.slice(4);

    }

    if (MAP_TABID_TO_HOSTNAME[TabID] !== TabHostname) {
        console.log('MapTabIDToHostname(), TabID CHANGING HOSTNAME =>', TabID, TabURL, TabHostname);
        // This is async but we are ok with the delay
        await UpdateLiveSessionTabID(TabID, TabHostname);
    }
    else {
        console.log('MapTabIDToHostname(), TabID SAME HOSTNAME', TabID, TabURL, TabHostname);
    }

}


async function OnNavigationCommitted(TabDetails) {
    if (!BOOTED) return;
    if (TabDetails.url && TabDetails.frameType === 'outermost_frame' && TabDetails.transitionQualifiers && TabDetails.transitionQualifiers.length > 0) {
        if (TabDetails.transitionQualifiers[0] === "server_redirect") {
            await MapTabIDToHostname(TabDetails.tabId, TabDetails.url);
        }
    }
}

async function OnBeforeNavigate(TabDetails) {
    
    if (!BOOTED) return;

    // We check if this is the main frame, we don't want to deal with anything else.
    if (TabDetails.parentFrameId !== -1) return;

    await MapTabIDToHostname(TabDetails.tabId, TabDetails.url);
    
}

function GetLiveSessionModifyHeadersRuleObject(StartingRuleID, RulePriority, TabID = null, Hostname = null) {

    
  let AlternateCount = 0; 
  let RulesArray = [];
  let TabIDToRuleIds = [];

  for (let i=0; i < RESOURCE_TYPE_CASE_COUNT; i++) {

      let Rule = {
          id: StartingRuleID,
          priority: RulePriority,
          action: {
              type: "modifyHeaders",
              requestHeaders: [
                  { header: "x-hdy-extension-version", operation: "set", value: '' + HOODY_CONFIG.ExtensionVersion },
                  { header: "x-hdy-browser-id", operation: "set", value: HOODY_CONFIG.BrowserID },
              ]
          },
          condition : {
              urlFilter : "*",
          }
      };

      if (TabID !== null) {
            Rule.action.requestHeaders.push({ header: "x-hdy-tab-id", operation: "set", value: '' + TabID });
            Rule.condition.tabIds = [TabID]
      }

      let AdditionalRequestHeaderType = {
        "header": "x-hdy-frame-type",
        "operation": "set", 
      };
    
      switch(AlternateCount) {
          case 0: {
              AdditionalRequestHeaderType.value = 'top';
              Rule.condition.resourceTypes = ['main_frame'];
              break;
          }
          case 1: {
              AdditionalRequestHeaderType.value = 'iframe';
              Rule.condition.resourceTypes = ['sub_frame'];
              break;
          }
          case 2: {
              AdditionalRequestHeaderType.value = 'resource';
              Rule.condition.resourceTypes = ["stylesheet", "script", "image", "font", "object", "ping", "csp_report","media", "webtransport","webbundle","other"];
              break;
          }
          case 3: {
              AdditionalRequestHeaderType.value = 'ajax';
              Rule.condition.resourceTypes = ["xmlhttprequest"];
              break;
          }
          case 4: {
              AdditionalRequestHeaderType.value = 'websocket';
              Rule.condition.resourceTypes = ["websocket"];
              break;
          }
      }

      Rule.action.requestHeaders.push(AdditionalRequestHeaderType);
      if (AlternateCount != 0 && Hostname) Rule.action.requestHeaders.push({ header: "x-hdy-main-frame-host", operation: "set", value: Hostname });

      AlternateCount++;
      if (AlternateCount >= RESOURCE_TYPE_CASE_COUNT) {
          AlternateCount = 0;
      }

      RulesArray.push(Rule);
      TabIDToRuleIds.push(StartingRuleID);
      StartingRuleID++;
      
    }

    // Update the map so we know how to delete those rules when necessary.
    MAP_TABID_TO_RULE_IDS[TabID] = TabIDToRuleIds;

    return RulesArray;
}

function GenerateLiveSessionRules() {

    let CurrentTabID = 0;
    let RulesArray = [];

    // This rule is to catch requests coming from preloading and service worker and eventually things that we couldn't foresee.
    // It can't include the TabID, so we have to do a filter without the TabID.
    // We include the minimum necessary to process the request which is the BrowserID, as we can't get anything else than that.
    let RulesForAllTabs = GetLiveSessionModifyHeadersRuleObject(1, 2, null, null);
    RulesArray.push(...RulesForAllTabs);


    for (let i=LIVE_SESSIONS_RULE_STARTING_ID; i < LIVE_SESSIONS_RULES_COUNT; i += RESOURCE_TYPE_CASE_COUNT) {
        let Rules = GetLiveSessionModifyHeadersRuleObject(i, 1, CurrentTabID, null);
        RulesArray.push(...Rules);
        CurrentTabID++;
    }

    console.log('GenerateLiveSessionRules()', RulesArray);

    return RulesArray;

}

function GenerateInitialTabIDsToRulesMapping() {
  
  let CurrentTabID = 0;
  let CurrentRules = 2;

  for (let i=LIVE_SESSIONS_RULE_STARTING_ID; i < LIVE_SESSIONS_RULES_COUNT; i += RESOURCE_TYPE_CASE_COUNT) {
      MAP_TABID_TO_RULE_IDS[CurrentTabID] = [];
      for (let b=0; b < RESOURCE_TYPE_CASE_COUNT; b++) {
          MAP_TABID_TO_RULE_IDS[CurrentTabID].push((CurrentRules + 1));
          CurrentRules++;
      }
      CurrentTabID++;
  }

}


function CreateLiveSessionRules() {
  
  return new Promise(function(resolve) {

      // First, we attempt to just update 1 session rule, this is because the extension could have crashed and be reloaded.
      // It's very costly to do that many Session rules, so we don't want to re-do it always.
      try {

        chrome.declarativeNetRequest.updateSessionRules({
            addRules: [
                {
                    id: 4000,
                    priority: 1,
                    action: {
                        type: "block",
                    },
                    condition : {
                        urlFilter : "test-url.com",
                    }
                }
            ],
          },
          function(cb) {

              if (typeof chrome.runtime.lastError !== 'undefined') {
                  if (typeof chrome.runtime.lastError.message !== 'undefined') {
                      if (chrome.runtime.lastError.message.includes('does not have a unique ID')) {
                          GenerateInitialTabIDsToRulesMapping();
                          resolve(false)
                          return;
                      }
                  }
              }
              
                chrome.declarativeNetRequest.updateSessionRules({
                    removeRuleIds: [4000],
                    addRules: GenerateLiveSessionRules(),
                },
                    function(cb) {
                        resolve(true);              
                })
          }
        );
      }
      catch(e) {
          console.log('YEP CATCH', e)
          GenerateInitialTabIDsToRulesMapping();
          resolve(false);
      }

  });

}


/*************************
    CHROME LISTENERS
************************/


chrome.webNavigation.onBeforeNavigate.addListener(OnBeforeNavigate);
chrome.webNavigation.onCommitted.addListener(OnNavigationCommitted);

chrome.tabs.onUpdated.addListener(OnTabUpdate);
chrome.tabs.onRemoved.addListener(OnTabClosed);
chrome.tabs.onCreated.addListener(OnTabCreated);

// handle data uri iframes here (until the chromium bug is fixed)
chrome.webRequest.onBeforeRequest.addListener(async details => {
    console.log(details)
}, { urls:[ 'data://*/*' ], types: [ 'sub_frame' ] }, [ 'blocking' ])

async function Startup() {
    // Create the Live Session rules for interception
    await CreateLiveSessionRules();
    BOOTED = true;
}



Startup();
