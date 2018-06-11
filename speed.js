const argv = require('yargs').argv;

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const cookie = require('cookie');
const ejs = require('ejs');
const ms = require('ms');
const uuid = require('uuid');
const mime = require('mime-types');
const debug = require('debug')('network-speed');
// ipip.net
const datx = require('ipip-datx');
const ipCity = new datx.City(path.join(__dirname, 'data/17monipdb/17monipdb.datx'));

// logs
const Log = require('log');
const LOG_DIR = argv.log || path.join(__dirname, 'logs');
require('mkdirp').sync(LOG_DIR);
const ACCESS_LOG = new Log('info', fs.createWriteStream(path.join(LOG_DIR, 'access.log'), {flags: 'a'}));
const FEEDBACK_LOG = new Log('info', fs.createWriteStream(path.join(LOG_DIR, 'feedback.log'), {flags: 'a'}));

// cookie name
const COOKIE_NETWORK = 'network';
const COOKIE_USER = 'uid';

// index.html 
const INDEX_TPL = ejs.compile(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), { catch: true });

function serverExtend(req, res) {
    // method 
    res.redirect = function (location, status = 302) {
        if (!location.startsWith('http:')) location = `http://${req.headers.host}${location}`;
        res.statusCode = status;
        res.setHeader('location', location);
        res.end(`redirect: ${location}`);
    };

    // field
    req.ip = req.socket.localAddress;
    req.ips = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.localAddress).split(',');
    req.cookies = cookie.parse(req.headers.cookie || '');

    let { pathname, query } = url.parse(req.url, true);
    req.query = query;
    req.pathname = pathname;
}

const server = http.createServer((req, res) => {
    // extend
    serverExtend(req, res);

    let { ips, pathname, query, cookies } = req;
    let ip = ips[0];
    let city = (ipCity.findSync(ip) || ['-', '-', '-', '-']).join('-');

    ACCESS_LOG.info(`${req.method}, ${pathname}, ${cookies[COOKIE_NETWORK] || '-'}, ${cookies[COOKIE_USER] || '-'}, ${ip}, "${city}", "${req.headers['user-agent']}"`);

    // res.setHeader('content-type', mime.contentType(pathname));
    if (pathname === '/speed.js') {
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        let rTime = query.rt;
        // 时间差
        let tdoa = Date.now() - rTime;
        let setCookie = cookie.serialize(COOKIE_NETWORK, tdoa, { maxAge: ms('1d') / 1000 });
        res.setHeader('set-cookie', setCookie);
        res.end(`window.onload = function() { document.getElementById('network').innerText = '${tdoa}ms'; }`);
    } else if (pathname === '/' || pathname === '/index.html') {
        // 用户追踪
        if (!cookies[COOKIE_USER]) {
            let setCookie = cookie.serialize(COOKIE_USER, uuid.v4(), { maxAge: ms('10 years') / 1000 });
            res.setHeader('set-cookie', setCookie);
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(INDEX_TPL({ network: cookies[COOKIE_NETWORK] }));
    } else if (pathname === '/clean') {
        // clean cookie 
        let setCookie = cookie.serialize(COOKIE_NETWORK, '', { expires: new Date('Thu, 01 Jan 1970 00:00:00 GMT') });
        let location = `http://${req.headers.host}/`;
        res.setHeader('set-cookie', setCookie);

        res.redirect('/');
    } else if (pathname === '/feedback') {
        let network = query.network;
        // let tdoa = cookies[COOKIE_NETWORK];
        FEEDBACK_LOG.info(`${req.method}, ${pathname}, ${cookies[COOKIE_NETWORK] || '-'}, ${network || '-'}, ${cookies[COOKIE_USER] || '-'}, ${ip}, "${city}", "${req.headers['user-agent']}"`);

        res.redirect('/');
    } else {
        res.statusCode = 404;
        res.end();
    }
});

if (argv.host) {
    server.listen(argv.port, argv.host, () => console.log(`start at ${argv.port}`));
} else {
    server.listen(argv.port, () => console.log(`start at ${argv.port}`));
}