try {
    const tabHostname = settings['x-hdy-main-frame-host']
    let old_BroadcastChannel = window.BroadcastChannel

    try {
        let old_name_getter = Object.getOwnPropertyDescriptor(window.BroadcastChannel.prototype, 'name').get
        utils.setDynamicPropOfProt(window.BroadcastChannel.prototype, 'name', function() {
            return (old_name_getter.bind(this)())
                .split('|')
                .filter(x => x.trim().length > 0)
                .slice(0, -1)
                .join('|')
        })
    } catch {}

    // Intl.BroadcastChannel spoof
    utils.setPropOfProt(window, 'BroadcastChannel', function BroadcastChannel(name) {
        return new old_BroadcastChannel(name + '|' + tabHostname)
    })

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }