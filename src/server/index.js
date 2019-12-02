import 'source-map-support/register'; // enable sourcemaps in node
import path from 'path';
import * as soundworks from 'soundworks/server';
import ServerExperience from './ServerExperience';
import ControllerExperience from './ControllerExperience';
import questions from './config/questions';

const configName = process.env.ENV || 'default';
const configPath = path.join(__dirname, 'config', configName);
let config = null;

// rely on node `require` as the path is dynamic
try {
  config = require(configPath).default;
} catch (err) {
  console.error(`Invalid ENV "${configName}", file "${configPath}.js" not found`);
  process.exit(1);
}

process.env.NODE_ENV = config.env;

if (process.env.PORT) {
  config.port = process.env.PORT;
}

soundworks.server.init(config);

soundworks.server.setClientConfigDefinition((clientType, config, httpRequest) => {
  return {
    clientType: clientType,
    env: config.env,
    appName: config.appName,
    websockets: config.websockets,
    defaultType: config.defaultClient,
    assetsDomain: config.assetsDomain,
  };
});

const questionCategories = Object.keys(questions);
const sharedParams = soundworks.server.require('shared-params');
sharedParams.addText('server-ip', 'Server IP', '');
sharedParams.addText('wifi-ssid', 'Wi-Fi SSID', '');
sharedParams.addText('num-players', '# players', '0');
sharedParams.addText('num-pending', '# pending', '0');
sharedParams.addText('mic-1-state', 'mic #1', '–');
sharedParams.addText('mic-2-state', 'mic #2', '–');
sharedParams.addText('mic-3-state', 'mic #3', '–');
sharedParams.addText('mic-4-state', 'mic #4', '–');
sharedParams.addEnum('running-state', 'running state', ['pre', 'running', 'stop', 'end'], 'pre');
sharedParams.addEnum('question-category', 'question category', questionCategories, questionCategories[0]);
sharedParams.addText('current-question', 'current question', '');

const experience = new ServerExperience();
const controller = new ControllerExperience();

soundworks.server.start();
