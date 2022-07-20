// settings.locale: Intl.Locale

try {
    if(settings.locale) {
        settings.locale = new Intl.Locale(settings.locale)
        
        // toLocaleString spoof
        {
            // global
            utils.redefineFunctionOfObject(
                window, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString(settings.locale, options)
                    }
                }
            )

            // number 
            utils.redefineFunctionOfObjectProto(
                window.Number.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )

            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
            
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )

            // object
            utils.redefineFunctionOfObjectProto(
                window.Object.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }

        // toLocaleLowerCase spoof
        {
            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleLowerCase', _toLocaleString => {
                    return function() {
                        return _toLocaleString.bind(this)(settings.locale)
                    }
                }
            )
        }

        // toLocaleUpperCase spoof
        {
            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleUpperCase', _toLocaleString => {
                    return function() {
                        return _toLocaleString.bind(this)(settings.locale)
                    }
                }
            )
        }

        // toLocaleTimeString spoof
        {
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleTimeString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }

        // toLocaleDateString spoof
        {
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleDateString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }
        
        // Intl.DateTimeFormat spoof
        let old_DateTimeFormat = window.Intl.DateTimeFormat
        utils.setPropOfProt(window.Intl, 'DateTimeFormat', function DateTimeFormat(...args) {
            return new old_DateTimeFormat(settings.locale)
        })

        // Intl.NumberFormat
        let old_NumberFormat = window.Intl.NumberFormat
        utils.setPropOfProt(window.Intl, 'NumberFormat', function NumberFormat(...args) {
            return new old_NumberFormat(settings.locale)
        })

        // Intl.Segmenter
        let old_Segmenter = window.Intl.Segmenter
        utils.setPropOfProt(window.Intl, 'Segmenter', function Segmenter(...args) {
            return new old_Segmenter(settings.locale)
        })

        // Intl.Collator
        let old_Collator = window.Intl.Collator
        utils.setPropOfProt(window.Intl, 'Collator', function Collator(...args) {
            return new old_Collator(settings.locale)
        })

        // Intl.DisplayNames
        let old_DisplayNames = window.Intl.DisplayNames
        utils.setPropOfProt(window.Intl, 'DisplayNames', function DisplayNames(...args) {
            return new old_DisplayNames(settings.locale)
        })

        // Intl.ListFormat
        let old_ListFormat = window.Intl.ListFormat
        utils.setPropOfProt(window.Intl, 'ListFormat', function ListFormat(...args) {
            return new old_ListFormat(settings.locale)
        })

        // Intl.PluralRules
        let old_PluralRules = window.Intl.PluralRules
        utils.setPropOfProt(window.Intl, 'PluralRules', function PluralRules(...args) {
            return new old_PluralRules(settings.locale)
        })

        // Intl.RelativeTimeFormat
        let old_RelativeTimeFormat = window.Intl.RelativeTimeFormat
        utils.setPropOfProt(window.Intl, 'RelativeTimeFormat', function RelativeTimeFormat(...args) {
            return new old_RelativeTimeFormat(settings.locale)
        })
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }