// settings.userAgent

try {
    if(settings.userAgent != undefined) {
        var userAgent = settings.userAgent
        var appVersion = userAgent.slice(userAgent.indexOf('/') + 1)
        utils.setPropOfProt(window.navigator, 'userAgent', userAgent)
        utils.setPropOfProt(window.navigator, 'appVersion', appVersion)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }