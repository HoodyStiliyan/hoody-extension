// settings.spoofMath

try {
    if(settings.spoofMath == true) {
        let f = () => 0
        let abs = Math.abs || f
        let acos = Math.acos || f
        let acosh = Math.acosh || f
        let asin = Math.asin || f
        let asinh = Math.asinh || f
        let atanh = Math.atanh || f
        let atan = Math.atan || f
        let sin = Math.sin || f
        let sinh = Math.sinh || f
        let cos = Math.cos || f
        let cosh = Math.cosh || f
        let tan = Math.tan || f
        let tanh = Math.tanh || f
        let exp = Math.exp || f
        let expm1 = Math.expm1 || f
        let log1p = Math.log1p || f

        // 5.5 == 5.5000000000000001
        // true

        const r = () => {
            const rr = () => Math.floor(settings.random * 9) + 1
            return settings.random > 0.1 ? Number(`0.000000000000000${rr()}`) : 0
        }

        Math.abs = v => abs(v) + r()
        Math.acos = v => acos(v) + r()
        Math.acosh = v => acosh(v) + r()
        Math.asin = v => asin(v) + r()
        Math.asinh = v => asinh(v) + r()
        Math.atanh = v => atanh(v) + r()
        Math.atan = v => atan(v) + r()
        Math.sin = v => sin(v) + r()
        Math.sinh = v => sinh(v) + r()
        Math.cos = v => cos(v) + r()
        Math.cosh = v => cosh(v) + r()
        Math.tan = v => tan(v) + r()
        Math.tanh = v => tanh(v) + r()
        Math.exp = v => exp(v) + r()
        Math.acos = v => acos(v) + r()
        Math.expm1 = v => expm1(v) + r()
        Math.log1p = v => log1p(v) + r()
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }