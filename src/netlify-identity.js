// import 'promise-polyfill';
// import 'isomorphic-fetch';
import { h, render } from 'preact';
import { observe } from 'mobx';
import { Provider } from 'mobx-preact'
import GoTrue from 'gotrue-js';
import App from './components/app';
import store from './state/store';
import Controls from './components/controls';
import modalCSS from './components/modal.css';

const callbacks = {};
function trigger(callback) {
	(callbacks[callback] || []).forEach((cb) => {
		cb.apply(cb, Array.prototype.slice.call(arguments, 1));
	});
}

const validActions = {
	login: true,
	error: true
}

const netlifyIdentity = {
	on: (event, cb) => {
		callbacks[event] = callbacks[event] || [];
		callbacks[event].push(cb);
	},
	open: (action) => {
		action = action || 'login';
		if (!validActions[action]) { throw(new Error(`Invalid action for open: ${action}`)); }
		store.openModal(store.user ? 'user' : action);
	},
	close: () => {
		store.closeModal();
	},
  logout: () => {
    store.logout();
  },
	currentUser: () => {
		if (!store.gotrue) { store.openModal('login'); }
		return store.gotrue && store.gotrue.currentUser();
	},
	get gotrue() {
		if (!store.gotrue) { store.openModal('login'); }
		return store.gotrue;
	},
  init: (options) => {
    init(options);
  }
}

function setStyle(el, css) {
	let style = "";
	for (const key in css) {
		style += `${key}: ${css[key]}; `;
	}
	el.style = style;
}

const localHosts = {
  localhost: true,
  '127.0.0.1': true,
  '0.0.0.0': true
}

function instantiateGotrue() {
	const isLocal = localHosts[document.location.host.split(':').shift()];
	const siteURL = isLocal && localStorage.getItem("netlifySiteURL");
	if (isLocal && siteURL) {
		const parts = [siteURL];
    if (!siteURL.match(/\/$/)) { parts.push('/'); }
    parts.push('.netlify/identity');
		return new GoTrue({APIUrl: parts.join('')});
	}
	if (isLocal) {
		return null;
	}

	return new GoTrue();
}

let root;
let controls;
let iframe;
const iframeStyle = {
	position: "fixed",
	top: 0,
	left: 0,
	border: "none",
	width: "100%",
	height: "100%",
	overflow: "visible",
	background: "transparent",
	display: "none"
};

observe(store.modal, 'isOpen', () => {
	if (!store.settings) { store.loadSettings() }
  setStyle(iframe, {...iframeStyle, display: store.modal.isOpen ? 'block' : 'none'})	;
	if (store.modal.isOpen) {
		trigger('open', store.modal.page);
	} else {
		trigger('close');
	}
});

observe(store, 'siteURL', () => {
	localStorage.setItem("netlifySiteURL", store.siteURL);
	store.init(instantiateGotrue(), true);
})

observe(store, 'user', () => {
	if (store.user) {
		trigger('login', store.user);
	} else {
		trigger('logout');
	}
})

observe(store, 'error', () => {
	trigger('error', store.error);
})

const routes = /(confirmation|invite|recovery|email_change)_token=([^&]+)/;
const errorRoute = /error=access_denied&error_description=403/;
const accessTokenRoute = /access_token=/

function runRoutes() {
	const hash = (document.location.hash || '').replace(/^#/, '');
	if (!hash) { return; }

	const m = hash.match(routes);
	if (m) {
		store.verifyToken(m[1], m[2]);
		document.location.hash = '';
	}

	const em = hash.match(errorRoute);
	if (em) {
		store.openModal("signup");
		document.location.hash = '';
	}

	const am = hash.match(accessTokenRoute);
	if (am) {
		const params = {};
		hash.split('&').forEach((pair) => {
			const [key, value] = pair.split('=');
			params[key] = value;
		});
		document.location.hash = '';
		store.openModal('login');
		store.completeExternalLogin(params);
	}
}



function init(options) {
  options = options || {};
	const controlEls = document.querySelectorAll("[data-netlify-identity-menu],[data-netlify-identity-button]");
	Array.prototype.slice.call(controlEls).forEach((el) => {
		let controls = null;
		const mode = el.getAttribute('data-netlify-identity-menu') === null ? 'button' : 'menu';
		render(<Provider store={store}><Controls mode={mode} text={el.innerText.trim()}/></Provider>, el, controls);
	})

	store.init(instantiateGotrue());

	iframe = document.createElement("iframe")
	iframe.id = "netlify-identity-widget";
	iframe.onload = () => {
		const styles = iframe.contentDocument.createElement("style");
		styles.innerHTML = modalCSS.toString();
		iframe.contentDocument.head.appendChild(styles);
		root = render(<Provider store={store}>
			<App />
		</Provider>, iframe.contentDocument.body, root);
		runRoutes();
	}
	setStyle(iframe, iframeStyle);
	iframe.src = "about:blank";
  const container = options.container ? document.querySelector : document.body;
	container.appendChild(iframe);
}

export default netlifyIdentity;
