try {
    function getCookieSupport() {
        var persist = true
        do {
            var c= 'gCStest='+Math.floor(Math.random()*100000000)
            document.cookie= persist? c+';expires=Tue, 01-Jan-2030 00:00:00 GMT' : c
            if (document.cookie.indexOf(c)!==-1) {
                document.cookie= c+';expires=Sat, 01-Jan-2000 00:00:00 GMT'
                return persist
            }
        } while (!(persist= !persist))
        return null
    }

    if(getCookieSupport()) {
        let worker = utils.cookieWorker()
        const tabHostname = settings['x-hdy-main-frame-host']
    
        var cookieDesc = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie') ||
                     Object.getOwnPropertyDescriptor(window.HTMLDocument.prototype, 'cookie')
        var oldCookie = cookieDesc.get.call(window.document)
    
        function appendHostname(str) {
            // parse to object
            let parsed = worker.parse(str)

            let appended = {}
    
            // apend hostname
            for(let key in parsed) {
                // don't append hostname to keywords
                if(['expires', 'path', 'SameSite', 'Secure'].includes(key)) {
                    appended[key] = parsed[key]
                    continue    
                }

                // this one is special, don't touch it
                if(key == 'hoodyOK') {
                    appended[key] = parsed[key]
                    continue
                }
    
                appended[key + '|' + tabHostname] = parsed[key]
            }
    
            // serialize back to normal string
            let final = ''
            for(let key in appended) {
                if(key.trim() == '|' + tabHostname) return ''
    
                if(appended[key] == 'true') {
                    final += key + '; '
                    break;
                }
                
                final += worker.serialize(key, appended[key]) + '; '
            }
    
            return decodeURIComponent(final)
        }
    
        function removeHostname(str) {
            // parse to object
            let parsed = worker.parse(str)
    
            let appended = {}
    
            // remove hostname
            for(let key in parsed) {
                let _hostname = key.split('|').reverse()[0]
                let rest = key.split('|').slice(0, -1).join('|')

                // cookie is comming from the http response
                if(rest.trim().length == 0) {
                    appended[key] = parsed[key]
                    continue
                }

                if(_hostname == tabHostname)
                    appended[rest] = parsed[key]
            }
    
            // serialize back to normal string
            let final = ''
            for(let key in appended) {
                if(key.trim() == '|' + tabHostname) return ''
    
                if(appended[key] == 'true') {
                    final += key + '; '
                    break;
                }
                
                final += worker.serialize(key, appended[key]) + '; '
            }
    
            let ret = decodeURIComponent(final).trim()
            if(ret[ret.length - 1] == ';') ret = ret.slice(0, -1)
            return ret
        }
    
        if (cookieDesc) {
            Object.defineProperty(window.document, 'cookie', {
                configurable: true,
    
                get: function () {
                    return removeHostname(cookieDesc.get.call(window.document))
                },
                set: function (val) {
                    return cookieDesc.set.call(window.document, appendHostname(val))
                }
            })
        }
    
        // we deleted the cookie so we need to rewrite it back
        window.document.cookie = removeHostname(oldCookie)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }