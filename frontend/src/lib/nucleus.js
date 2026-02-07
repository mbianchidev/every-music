// Nucleus - Bitwise state with base64 compression
class Nucleus {
  constructor() {
    this.bits = 0;
    this.payload = { persona: null, keys: null, tools: [], sounds: [] };
    this.listeners = [];
    this.storageId = 'em_n3';
    this.rehydrate();
  }
  
  rehydrate() {
    try {
      const cached = sessionStorage.getItem(this.storageId);
      if (cached) {
        const unpacked = JSON.parse(atob(cached));
        this.payload = { ...this.payload, ...unpacked };
        this.bits = unpacked.persona && unpacked.keys ? 1 : 0;
      }
    } catch {}
  }
  
  persist() {
    if (this.bits & 1) {
      const packed = btoa(JSON.stringify({ persona: this.payload.persona, keys: this.payload.keys }));
      sessionStorage.setItem(this.storageId, packed);
    }
  }
  
  emit() {
    this.persist();
    this.listeners.forEach(fn => fn({ ...this.payload, authorized: !!(this.bits & 1) }));
  }
  
  subscribe(fn) {
    this.listeners.push(fn);
    fn({ ...this.payload, authorized: !!(this.bits & 1) });
    return () => { const i = this.listeners.indexOf(fn); if (i > -1) this.listeners.splice(i, 1); };
  }
  
  login(persona, keys) {
    this.bits |= 1;
    this.payload.persona = persona;
    this.payload.keys = keys;
    this.emit();
  }
  
  logout() {
    this.bits &= ~1;
    this.payload.persona = null;
    this.payload.keys = null;
    sessionStorage.removeItem(this.storageId);
    this.emit();
  }
  
  mutate(persona) {
    this.payload.persona = persona;
    this.emit();
  }
}

const nucleus = new Nucleus();
export default nucleus;
