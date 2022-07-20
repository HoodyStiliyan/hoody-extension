try {
    const rand = {
        noise: function () {
            const SIGN = settings.random < settings.random ? -1 : 1;
            return Math.floor(settings.random + SIGN * settings.random);
        },
        sign: function () {
            const tmp = [-1, -1, -1, -1, -1, -1, +1, -1, -1, -1];
            const index = Math.floor(settings.random * tmp.length);
            return tmp[index];
        },
    };
    //
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        get() {
            const height = Math.floor(this.getBoundingClientRect().height);
            const result = height + rand.noise()
            return result;
        },
    });
    //
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get() {
            const width = Math.floor(this.getBoundingClientRect().width);
            const result = width + rand.noise()
            return result;
        },
    });
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }