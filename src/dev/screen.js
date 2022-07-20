// settings.screen = {
//     width: Number,
//     height: Number,
// }

try {
    if(settings.screen) {
        utils.setPropOfProt(window.screen, 'width', settings.screen.width)
        utils.setPropOfProt(window.screen, 'height', settings.screen.height)

        let availOffset = Math.floor(settings.random * 100) + 10

        utils.setPropOfProt(window.screen, 'availWidth', settings.screen.width + availOffset)
        utils.setPropOfProt(window.screen, 'availHeight', settings.screen.height + availOffset)

        let colorDepth = window.screen.colorDepth + (Math.floor(settings.random * 10) - 5) + 1
        utils.setPropOfProt(window.screen, 'colorDepth', colorDepth)

        let pixelDepth = window.screen.pixelDepth + (Math.floor(settings.random * 10) - 5) + 1
        utils.setPropOfProt(window.screen, 'pixelDepth', pixelDepth)

        let availLeft = (Number(window.screen.availLeft) || 0) + Math.floor(settings.random * 100)
        let availTop = (Number(window.screen.availTop) || 0) + Math.floor(settings.random * 100)
        utils.setPropOfProt(window.screen, 'availLeft', availLeft)
        utils.setPropOfProt(window.screen, 'availTop', availTop)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }