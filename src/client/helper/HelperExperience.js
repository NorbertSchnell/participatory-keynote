import * as soundworks from 'soundworks/client';

const client = soundworks.client;
const audioContext = soundworks.audioContext;
const numHelpers = 4;

const template = `
  <div class="section-top flex-middle">
    <p><%= top %></p>
  </div>
  <div class="section-center flex-center">
    <p class="big"><%= center %></p>
  </div>
  <div class="section-bottom flex-middle">
    <p><%= bottom %></p>
  </div>
`;

const model = {
  top: '',
  center: '',
  bottom: '',
};

const displayText = {
  'init': {
    center: 'Ok.',
    bottom: 'Get your mic and wait for instructions.',
  },
  'compete': {
    center: 'Compete for speaker raising the hand.',
    bottom: 'Touch the screen to claim.',
  },
  'claimed': {
    center: 'Hold on...',
    bottom: '',
  },
  'assigned': {
    center: 'Hand out the mic to the speaker raising the hand.',
    bottom: 'Touch the screen when done.',
  },
  'ready': {
    center: 'Mic ready...',
    bottom: 'Wait the speaker\'s turn.',
  },
  'onair': {
    center: 'On air!',
    bottom: '',
  },
  'onair-end': {
    center: 'On air!',
    bottom: 'Touch the screen when done.',
  },
  'end': {
    center: 'Thanks!',
    bottom: 'That\'s all.',
  },
};

class HelperExperience extends soundworks.Experience {
  constructor(assetsDomain) {
    super();

    this.micIndex = 0;
    this.timeout = null;

    if (client.urlParams !== null) {
      const micId = client.urlParams[0];
      const micIndex = parseInt(micId) - 1;

      if (micIndex >= 0 && micIndex < numHelpers)
        this.micIndex = micIndex;
    }

    this.platform = this.require('platform', { features: ['web-audio'] });
    this.sharedParams = this.require('shared-params');
    this.audioBufferManager = this.require('audio-buffer-manager', {
      assetsDomain: assetsDomain,
      files: [ /* ... */ ],
    });

    this.onCompeteForSpeaker = this.onCompeteForSpeaker.bind(this);
    this.onAssignSpeaker = this.onAssignSpeaker.bind(this);
    this.onSpeakerOnAir = this.onSpeakerOnAir.bind(this);
    this.onReset = this.onReset.bind(this);
    this.onClick = this.onClick.bind(this);
    this.setRunningState = this.setRunningState.bind(this);
  }

  async start() {
    super.start();

    this.view = new soundworks.SegmentedView(template, model, {}, { id: 'helper' });
    await this.show();

    this.setState('init');

    this.view.model.top = `Mic #${this.micIndex + 1}`;
    this.view.render();

    this.send('register-helper', this.micIndex);
    this.receive('compete-for-speaker', this.onCompeteForSpeaker);
    this.receive('assign-speaker', this.onAssignSpeaker);
    this.receive('speaker-onair', this.onSpeakerOnAir);
    this.receive('reset', this.onReset);

    window.addEventListener('click', this.onClick);
    window.addEventListener('touchstart', this.onClick);

    this.sharedParams.addParamListener('running-state', this.setRunningState);
  }

  setDisplayText(state) {
    const textObj = displayText[state];

    if (textObj.top !== undefined)
      this.view.model.top = textObj.top;

    if (textObj.center !== undefined)
      this.view.model.center = textObj.center;

    if (textObj.bottom !== undefined)
      this.view.model.bottom = textObj.bottom;

    this.view.render();
  }

  setState(state) {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (state !== this.state) {
      if (this.state !== null)
        this.view.$el.classList.remove(`state-${this.state}`);

      this.state = state;
      this.setDisplayText(state);

      this.view.$el.classList.add(`state-${state}`);
    }
  }

  onCompeteForSpeaker() {
    if (this.state === 'init')
      this.setState('compete');
  }

  onAssignSpeaker(micIndex) {
    if (this.state === 'compete')
      this.setState('init');
    else if (this.micIndex === micIndex)
      this.setState('assigned');
  }

  onSpeakerOnAir() {
    if (this.state === 'ready') {
      this.setState('onair');
      this.timeout = setTimeout(() => this.setState('onair-end'), 2000);
    }
  }

  onReset() {
    this.setState('init');
  }

  setRunningState(value) {
    if (value !== this.runningState) {
      switch (value) {
        case 'pre':
        case 'running':
          this.setState('init');
          break;

        case 'end':
          this.setState('end');
          break;
      }

      this.runningState = value;
    }
  }

  onClick() {
    switch (this.state) {
      case 'init':
        break;

      case 'compete':
        this.send('claim-speaker');
        this.setState('claimed');
        break;

      case 'assigned':
        this.send('speaker-ready');
        this.setState('ready');
        break;

      case 'onair-end':
        this.send('speaker-done');
        this.setState('init');
        break;
    }
  }
}

export default HelperExperience;
