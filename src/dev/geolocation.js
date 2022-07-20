// settings.gps: GeolocationCoordinates
// https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates

try {
    if(settings.gps) {
        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'getCurrentPosition',
            getCurrentPosition => {
                return function (success, error, options) {
                    if(!success) return getCurrentPosition()
                    return getCurrentPosition(res => {
                        Object.keys(settings.gps).map(key => {
                            utils.setPropOfProt(
                                Object.getPrototypeOf(res.coords), 
                                key, 
                                settings.gps[key]
                            )
                        })
                        success(res)
                    }, error, options)
                }
            }
        )

        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'watchPosition',
            watchPosition => {
                return function (success, error, options) {
                    if(!success) return watchPosition()
                    return watchPosition(res => {
                        Object.keys(settings.gps).map(key => {
                            utils.setPropOfProt(
                                Object.getPrototypeOf(res.coords), 
                                key, 
                                settings.gps[key]
                            )
                        })
                        success(res)
                    }, error, options)
                }
            }
        )

        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'clearWatch',
            clearWatch => {
                return function (id) {
                    return clearWatch(id)
                }
            }
        )
    }

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }