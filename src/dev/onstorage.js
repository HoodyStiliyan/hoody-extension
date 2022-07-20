try {
    const tabHostname = settings['x-hdy-main-frame-host']

    window.addEventListener('storage', event => {
        if(event.key && !event.key.endsWith('|' + tabHostname)) {
            event.stopImmediatePropagation()
        }
    })
    
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }