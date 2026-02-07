import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './lib/styles.js';
import BootScreen from './pages/BootScreen.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import RegisterScreen from './pages/RegisterScreen.jsx';
import FeedScreen from './pages/FeedScreen.jsx';
import ProfileScreen from './pages/ProfileScreen.jsx';
import EditProfileScreen from './pages/EditProfileScreen.jsx';
import CreatePostScreen from './pages/CreatePostScreen.jsx';
import MyPostsScreen from './pages/MyPostsScreen.jsx';
import SavedPostsScreen from './pages/SavedPostsScreen.jsx';

// Orchestrator - Hash-based router
class Orchestrator extends Component {
  constructor(props) {
    super(props);
    this.state = { route: window.location.hash.slice(1) || 'boot' };
  }
  
  componentDidMount() {
    window.addEventListener('hashchange', this.handleRoute);
  }
  
  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRoute);
  }
  
  handleRoute = () => {
    this.setState({ route: window.location.hash.slice(1) || 'boot' });
  };
  
  render() {
    const screens = {
      'boot': BootScreen,
      'login': AuthScreen,
      'register': RegisterScreen,
      'feed': FeedScreen,
      'profile': ProfileScreen,
      'edit-profile': EditProfileScreen,
      'create': CreatePostScreen,
      'my-posts': MyPostsScreen,
      'saved': SavedPostsScreen
    };
    
    const Screen = screens[this.state.route] || BootScreen;
    return <Screen />;
  }
}

// Initialize styles
const styleTag = document.createElement('style');
styleTag.textContent = styles;
document.head.appendChild(styleTag);

// Mount app
const root = createRoot(document.getElementById('root'));
root.render(<Orchestrator />);
