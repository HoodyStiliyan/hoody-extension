// console.log(top.origin)

// use the hoody key for stuff like fetching the payload/settings
const hoodyKey = '2b4444e7d477f247'

// mutes all load events of iframes until the payload inside the iframe informs
// the parent page that it has loaded successfully
// note: this function should be used like this -> executeCode(silenceIframeSrcDocLoadEvent())
function silenceIframeSrcDocLoadEvent() {
    return `(${
        function (hoodyKey){
            // returns the internalID variable or waits for it to be set and then returns it
            async function getInternalID(_window) {
                if(_window.internalID) return new Promise(resolve => resolve(_window.internalID))

                return new Promise(resolve => {
                    Object.defineProperty(_window, 'internalID', {
                        configurable: true,
                        set(v){
                            Object.defineProperty(_window, 'internalID', {
                                configurable: true, 
                                enumerable: true, 
                                writable: true, 
                                value: v 
                            })
                            resolve(v)
                        }
                    })
                })
            }

            // we store the iframes, because we're going to need to get the onload attribute later
            let iframeMap = new Map()

            // we store the internalIDs of the loaded frames
            let loadedIframes = new Array()

            // function to itterate over the iframe map and find an iframe and return the internal id
            function searchIframe(queryIframe) {
                const iterator = iframeMap.entries()

                for(let i = 0; i < iframeMap.size; i++) {
                    const [ internalID, iframeData ] = iterator.next().value
                    const iframe = iframeData.iframe
                    if(queryIframe == iframe) {
                        return internalID
                    }
                }
            }

            window.numb = e => {
                const is_srcdoc = e.target.srcdoc !== undefined && e.target.srcdoc.trim().length > 0 === true

                // only mute iframe srcdoc that hasn't been spoofed yet
                try {
                    if(
                        !(e.target instanceof HTMLIFrameElement) ||
                        !is_srcdoc ||
                        (e.target.internalID && loadedIframes.includes(e.target.internalID))
                    ) return
                    else e.stopImmediatePropagation()
                } catch { return }

                // add custom internalID property to the iframe element "globalThis"
                if(e.target.internalID == undefined) {
                    // the on load could be because we reload the iframe after injection
                    // we have to search if it exists before creating a new one
                    const sameIframeID = searchIframe(e.target)
                    const calculatedID = sameIframeID || Number(Math.random().toString().slice(2))
                    e.target.internalID = calculatedID
                }

                if(!iframeMap.has(e.target.internalID))
                    iframeMap.set(e.target.internalID, { iframe: e.target, listeners: [] })
            }

            // mute all on load event listeners for iframes
            document.addEventListener('load', window.numb, { capture: true })

            // we override the addeventlistner function, and we store the ones added
            // and we execute them when the payload inside the iframe loads
            // and we restore the original function
            let old_addEventListner = window.HTMLIFrameElement.prototype.addEventListener
            window.HTMLIFrameElement.prototype.addEventListener = function(type, listener, useCapture) {
                if(type != 'load') old_addEventListner(type, listener, useCapture)
                
                getInternalID(this).then(internalID => {
                    const iframeNotSpoofed = !loadedIframes.includes(internalID)
                    if(iframeNotSpoofed) iframeMap.get(internalID).listeners.push(listener)
                    else old_addEventListner(type, listener, useCapture)
                })
            }
            
            // hide it just in case
            window.HTMLIFrameElement.prototype.addEventListener.toString = () => 'function addEventListener() { [native code] }'

            // listen for data comming from the payload of some iframe child
            window.addEventListener('message', msg => {
                // format is as follows: payload_loaded_${hoodyKey}_${iframeInternalID}
                // !important! we add hoodyKey to the msg.data to prevent sites from
                // !important! exploiting our functions and disabling our defences
                if(!msg.data.startsWith(`payload_loaded_${hoodyKey}`)) return;
                
                // this iframe is telling me that it loaded
                const internalID = Number(msg.data.split('_').reverse()[0])
                const iframeItem = iframeMap.get(internalID)

                // now we have to call every event listener that was added before us
                iframeItem.listeners.forEach((listener, i) => {
                    listener()
                    iframeItem.listeners = iframeItem.listeners.splice(i, 1)
                })

                // and also the onload property listener must be called
                const onloadPropEvt = iframeItem.iframe.onload
                if(onloadPropEvt) onloadPropEvt()
                
                // save this id as spoofed/loaded
                loadedIframes.push(internalID)
            }, { capture: true })
        }
    })("${hoodyKey}");`
}

// redirect to custom data uri by injecting anchor tag and clicking it
function redirectPage(url) {
    try {
        let anc = document.createElement('a')
        anc.href = url
        document.documentElement.insertAdjacentElement('afterbegin', anc)
        setTimeout(function () { anc.click() }, 0)
    } catch { }

    // we block the page because anc.click will be a little slow
    blockPageWithCSP()
}

// prevent the page from loading by using blocking CSP meta tag
function blockPageWithCSP() {
    let head = document.head || document.createElement('head')
    let meta = document.createElement('meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('content', "default-src 'none';")
    head.appendChild(meta)
    document.documentElement.insertAdjacentElement('afterbegin', head)
}

// prevent the page from loading by blocking events and using js hacks
function blockPageWithJS() {
    function crash() {
        if (typeof status === 'string') alert(status)
        window.addEventListener('error', function (e) {e.preventDefault();e.stopPropagation();}, false)
        var handlers = [
            'copy', 'cut', 'paste',
            'beforeunload', 'blur', 'change', 'click', 'contextmenu', 'dblclick', 'focus', 'keydown', 'keypress', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'resize', 'scroll',
            'DOMNodeInserted', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument', 'DOMNodeInsertedIntoDocument', 'DOMAttrModified', 'DOMCharacterDataModified', 'DOMElementNameChanged', 'DOMAttributeNameChanged', 'DOMActivate', 'DOMFocusIn', 'DOMFocusOut', 'online', 'offline', 'textInput',
            'abort', 'close', 'dragdrop', 'load', 'paint', 'reset', 'select', 'submit', 'unload'
        ]
        function stopPropagation (e) {
            try {
                e.stopPropagation()
                e.preventDefault() // Stop for the form controls, etc., too?
            } catch { }
        }
        handlers.map(h => window.addEventListener(h, function (e) { stopPropagation(e) }, true))
        document.writeln(' ')
        try {
            window.stop()
            window.document.execCommand('Stop')
        } catch {
            try {
                // crash the page with browser bug
                window.document.write('<script type="text/undefined">')
            }
            catch { }
        }
        throw ''
    }
    executeCode('' + crash)
}

// sync way to convert data uri to blob
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n)
    while(n--) u8arr[n] = bstr.charCodeAt(n)
    return new Blob([u8arr], {type:mime})
}

// sync way to convert blob to data uri
function blobURLtoData(bloburl) {
    try {
        var req
        req = new XMLHttpRequest()
        req.open('GET', bloburl, false)
        req.send()
        URL.revokeObjectURL(bloburl)
        return `data:text/html;base64,` + btoa(req.responseText)
    } catch {
        return `data:text/html;base64,`
    }
}

// sync and hacky way to execute code from content script without injecting a script src
function executeCode(payloadCode) {
    let event = new CustomEvent('reset')
    document.documentElement.setAttribute('onreset', payloadCode)
    document.documentElement.dispatchEvent(event)
    document.documentElement.removeAttribute('onreset')
}

function getCookie(name) {
    var cookieArr = document.cookie.split(";")
    for(var i = 0; i < cookieArr.length; i++) {
        var cookiePair = cookieArr[i].split("=")
        if(name == cookiePair[0].trim()) {
            return decodeURIComponent(cookiePair[1])
        }
    }
    return null
}

// reties the fetch every one second until it succeeds
async function smartFetch(url, options) {
    return new Promise(resolve => {

        // retry after every caught error
        function onError(error) {
            setTimeout(() => {
                smartFetch(url).then(resolve)
            }, 1000)
        }

        try {
            fetch(url, options).then(
                function(response) {
                    if(response.ok)
                        return response.text().then(resolve).catch(onError)
                    else
                        return onError()
                }    
            ).catch(onError)
        }
        catch {
            onError()
        }
    })
}

// checks if the given data uri has the script injected from the proxy/daemon
// !important! we add the hoodyKey to the script class
// !important! in order to prevent websites from injecting an iframe
// !important! that starts with the same signiture
function isDataURISpoofed(uri) {
    try {
        // convert data uri to text
        // check if it starts with that
        const base64AsText = atob(uri.split(',')[1])
        return base64AsText.startsWith(`<script class="hoody-protect ${hoodyKey}">;;;;;;`)
    } catch { return false }
}

(function () {
    // due to the fast nature of iframes with srcdoc we need to mute the load listeners
    // until we're sure the payload has been injected into the iframe
    // we do that to prevent leakage of information, like fonts, canvas data, codecs, etc...
    executeCode(silenceIframeSrcDocLoadEvent())

    if(window != top) {
        // handle data uri
        if (
            window.location.href.startsWith('data:') &&
            // data uri is not spoofed yet
            !isDataURISpoofed(window.location.href)
        ) return redirectPage(`https://hoodyiframeuri.${hoodyKey}/iframeDefence/${window.location.href}`)

        // handle blob uri
        if (window.location.href.startsWith('blob:')) {
            // convert blob to data uri so it can be injeted to on the proxy side
            const blobAsDataUri = blobURLtoData(window.location.href)
            return redirectPage(`https://hoodyiframeuri.${hoodyKey}/iframeDefence/blob:${blobAsDataUri}`)
        }

        // handle srcdoc
        if (window.location.href.startsWith('about:srcdoc')) {
            if(!sessionStorage.getItem('srcdocInjected')){
                blockPageWithCSP();
                (async function() {
                    const payloadCode = await smartFetch(`/${hoodyKey}/hoodyPayload.js`)
                    sessionStorage.setItem('srcdocInjected', payloadCode)
                    redirectPage(window.location.href)
                })()
            }
            else {
                const payloadCode = sessionStorage.getItem('srcdocInjected')
                executeCode(payloadCode)
                sessionStorage.removeItem('srcdocInjected')
            }
        }

        return
    }

    // for iframes we redirect so no cache problems
    // for actual document window however we need to be clever
    const hoodyTimestamp = getCookie('hoodyOK') || null
    const hoodyAgeSeconds = (new Date() - Number(hoodyTimestamp)) / 1000
    const hoodySessionKey = 'hoodyFetchedText-' + window.location.href

    // missing or too old cookie, we need to act
    if(hoodyTimestamp == null || hoodyAgeSeconds > 60) {
        if(!sessionStorage.getItem(hoodySessionKey)){
            blockPageWithCSP();
            (async function() {
                const payloadCode = await smartFetch(`/${hoodyKey}/hoodyPayload.js`)
                sessionStorage.setItem(hoodySessionKey, payloadCode)
                redirectPage(window.location.href)
            })()
        }
        else {
            const payloadCode = sessionStorage.getItem(hoodySessionKey)
            executeCode(payloadCode)
            sessionStorage.removeItem(hoodySessionKey)
        }
    }
})()