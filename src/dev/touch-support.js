// settings.spoofTouch

try {
    if(settings.spoofTouch == true) {
        if(window.navigator.maxTouchPoints !== undefined) {
            utils.setPropOfProt(window.navigator, 'maxTouchPoints', undefined)
        }
        else {
            let a = Math.floor(settings.random * 4) + 1
            utils.setPropOfProt(window.navigator, 'maxTouchPoints', a)
        }
        
        if(window.navigator.msMaxTouchPoints !== undefined) {
            utils.setPropOfProt(window.navigator, 'msMaxTouchPoints', undefined)
        }
        else {
            let a = Math.floor(settings.random * 4) + 1
            utils.setPropOfProt(window.navigator, 'msMaxTouchPoints', a)
        }
        
        if('ontouchstart' in window) {
            utils.setPropOfProt(window, 'ontouchstart', null)
        }
        else {
            window.ontouchstart = (_this, event) => {}
        }
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }