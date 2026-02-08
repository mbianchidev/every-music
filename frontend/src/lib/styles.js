const styles = `
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html { height: -webkit-fill-available; }
body { font-family: 'Work Sans', sans-serif; background: #0A0A0A; color: #F8F8F8; overflow-x: hidden; min-height: 100vh; min-height: -webkit-fill-available; -webkit-font-smoothing: antialiased; }
@keyframes spin { to { transform: rotate(360deg); } }
.btn { padding: 1rem 2rem; font-family: 'Fredoka', sans-serif; font-size: 1.25rem; font-weight: 700; text-transform: uppercase; border: 4px solid #0A0A0A; cursor: pointer; box-shadow: 8px 8px 0 #0A0A0A; transition: all 0.15s; outline: none; min-height: 48px; touch-action: manipulation; }
.btn:hover { transform: translate(4px, 4px); box-shadow: 4px 4px 0 #0A0A0A; }
.btn:active { transform: translate(8px, 8px); box-shadow: none; }
.btn-primary { background: #FF006E; color: #F8F8F8; }
.btn-secondary { background: #00F5FF; color: #0A0A0A; }
.btn-tertiary { background: #CCFF00; color: #0A0A0A; }
.btn-ghost { background: transparent; color: #F8F8F8; border-color: #F8F8F8; }
.input { width: 100%; padding: 1rem; font-size: 1rem; border: 4px solid #F8F8F8; background: #2B2B2B; color: #F8F8F8; outline: none; min-height: 48px; border-radius: 0; -webkit-appearance: none; }
.input:focus { border-color: #00F5FF; box-shadow: 0 0 0 4px rgba(0,245,255,0.2); }
.input::placeholder { color: rgba(248,248,248,0.4); }
.card { padding: 1.5rem; background: #2B2B2B; border: 4px solid #F8F8F8; margin-bottom: 1.5rem; }
.card-highlight { background: linear-gradient(135deg, #2B2B2B 0%, #1A1A1A 100%); border-color: #FF006E; }
.heading-xl { font-family: 'Fredoka', sans-serif; font-size: clamp(3rem, 8vw, 6rem); font-weight: 800; text-transform: uppercase; line-height: 0.9; margin-bottom: 1rem; }
.heading-lg { font-family: 'Fredoka', sans-serif; font-size: clamp(1.75rem, 5vw, 3.5rem); font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 1rem; }
.heading-md { font-family: 'Fredoka', sans-serif; font-size: clamp(1.25rem, 3vw, 2.5rem); font-weight: 700; line-height: 1.1; color: #00F5FF; margin-bottom: 1rem; }
.container { max-width: 1200px; margin: 0 auto; padding: 1.5rem; padding-top: calc(1.5rem + env(safe-area-inset-top, 0px)); padding-left: calc(1.5rem + env(safe-area-inset-left, 0px)); padding-right: calc(1.5rem + env(safe-area-inset-right, 0px)); min-height: 100vh; }
.container-narrow { max-width: 600px; margin: 0 auto; padding: 1.5rem; padding-top: calc(1.5rem + env(safe-area-inset-top, 0px)); padding-left: calc(1.5rem + env(safe-area-inset-left, 0px)); padding-right: calc(1.5rem + env(safe-area-inset-right, 0px)); min-height: 100vh; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; padding-bottom: 6rem; }
.nav { position: fixed; bottom: 0; left: 0; right: 0; background: #2B2B2B; border-top: 4px solid #F8F8F8; display: flex; justify-content: space-around; padding: 0.75rem; padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)); z-index: 1000; }
.nav-item { background: transparent; border: none; color: #F8F8F8; padding: 0.5rem 1rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; font-size: 0.875rem; font-weight: 600; outline: none; min-height: 44px; touch-action: manipulation; }
.nav-item-active { background: #FF006E; border: 2px solid #0A0A0A; }
.spinner { width: 60px; height: 60px; border: 4px solid #2B2B2B; border-top-color: #FF006E; border-radius: 50%; animation: spin 0.8s linear infinite; }
.error { padding: 1rem; background: rgba(255,0,110,0.2); border: 2px solid #FF006E; color: #FF006E; margin-bottom: 1rem; }
.success { padding: 1rem; background: rgba(204,255,0,0.2); border: 2px solid #CCFF00; color: #CCFF00; margin-bottom: 1rem; }
.tag { padding: 0.25rem 0.75rem; background: #00F5FF; color: #0A0A0A; font-size: 0.875rem; font-weight: 700; border: 2px solid #0A0A0A; display: inline-block; margin-right: 0.5rem; margin-bottom: 0.5rem; }
@media (max-width: 480px) {
  .btn { font-size: 1rem; padding: 0.875rem 1.5rem; box-shadow: 6px 6px 0 #0A0A0A; }
  .btn:hover { transform: translate(3px, 3px); box-shadow: 3px 3px 0 #0A0A0A; }
  .btn:active { transform: translate(6px, 6px); box-shadow: none; }
  .card { padding: 1.25rem; border-width: 3px; }
  .grid { grid-template-columns: 1fr; }
}
`;

export default styles;
