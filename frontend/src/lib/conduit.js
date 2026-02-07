import nucleus from './nucleus.js';

// Conduit - XHR protocol
class Conduit {
  constructor() {
    this.base = '/realm';
  }
  
  transmit(path, opts = {}) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open(opts.method || 'GET', `${this.base}${path}`);
      x.setRequestHeader('Content-Type', 'application/json');
      
      if (opts.auth && nucleus.payload.keys?.accessToken) {
        x.setRequestHeader('Authorization', `Bearer ${nucleus.payload.keys.accessToken}`);
      }
      
      x.onload = () => {
        try {
          const d = JSON.parse(x.responseText);
          x.status < 300 ? res(d.data) : rej(new Error(d.error?.message || 'Failed'));
        } catch { rej(new Error('Parse error')); }
      };
      
      x.onerror = () => rej(new Error('Network error'));
      x.send(opts.body ? JSON.stringify(opts.body) : null);
    });
  }
}

const conduit = new Conduit();
export default conduit;
