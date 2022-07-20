// settings.deviceMemory
try {
    if(settings.deviceMemory) {
        utils.setPropOfProt(window.navigator, 'deviceMemory', settings.deviceMemory)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }