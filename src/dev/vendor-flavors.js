// settings.flavor

// 'chrome'
// 'safari'
// '__crWeb'
// '__gCrWeb'
// 'yandex'
// '__yb'
// '__ybro'
// '__firefox__'
// '__edgeTrackingPreventionStatistics'
// 'webkit'
// 'oprt'
// 'samsungAr'
// 'ucweb'
// 'UCShellJava'
// 'puffinDevice'

try {
    let flavors = [
        'chrome', 'safari',
        '__crWeb', '__gCrWeb',
        'yandex', '__yb',
        '__ybro', '__firefox__',
        '__edgeTrackingPreventionStatistics',
        'webkit', 'oprt',
        'samsungAr', 'ucweb',
        'UCShellJava', 'puffinDevice'
    ]

    // delete current flavor
    for(let flavor of flavors) {
        if(window[flavor]) {
            delete window[flavor]
            window[flavor] = undefined
            break
        }
    }

    window[settings.flavor] = getFlavorObject()

    function getFlavorObject() {
        switch(settings.flavor) {
            case 'chrome':
                return {
                    // todo
                }
            default: {
                return {}
            }
        }
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }