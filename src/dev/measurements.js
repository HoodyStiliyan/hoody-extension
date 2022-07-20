try {
    if(settings.spoofMeasurements) {
        utils.redefineFunctionOfObjectProto(
            window.HTMLElement.prototype, 
            'getBoundingClientRect', 
            _getBoundingClientRect => {
            return function () {
                const result = _getBoundingClientRect.bind(this)()

                const multipler = 0.00001

                result.x += multipler * settings.random
                result.y += multipler * settings.random
                result.width += multipler * settings.random
                result.height += multipler * settings.random
                result.top += multipler * settings.random
                result.right += multipler * settings.random
                result.left += multipler * settings.random
                result.bottom += multipler * settings.random

                return result
            }
        })
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }