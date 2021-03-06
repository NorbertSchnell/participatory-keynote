import * as soundworks from 'soundworks/client';
import HelperExperience from './HelperExperience';
import serviceViews from '../shared/serviceViews';

function bootstrap() {
  document.body.classList.remove('loading');

  const config = Object.assign({ appContainer: '#container' }, window.soundworksConfig);
  soundworks.client.init(config.clientType, config);

  soundworks.client.setServiceInstanciationHook((id, instance) => {
    if (serviceViews.has(id))
      instance.view = serviceViews.get(id, config);
  });

  const experience = new HelperExperience(config.assetsDomain);
  soundworks.client.start();

  soundworks.client.socket.addStateListener(eventName => {
    if (eventName === 'disconnect') {
      setTimeout(() => window.location.reload(true), 2000);
    }
  });
}

window.addEventListener('load', bootstrap);
