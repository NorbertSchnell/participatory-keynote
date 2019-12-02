import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

function centToLin(cent) {
  return Math.pow(2, cent / 1200);
}

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
    center: 'Just a minute...',
    bottom: '... we\'ll start all together',
  },
  'idle': {
    center: 'Listen.',
    bottom: 'Touch the screen to request a microphone.',
  },
  'request': {
    center: 'Waiting for available mic...',
    bottom: 'Touch the screen to cancel request.',
  },
  'handup': {
    center: 'Please raise your hand...',
    bottom: '... and wait for mic.',
  },
  'ready': {
    center: 'Get ready...',
    bottom: '... while waiting your turn.',
  },
  'onair': {
    center: 'It\'s your turn!',
    bottom: 'Please consider the question displayed.',
  },
  'end': {
    center: 'Thanks!',
    bottom: 'That\'s all.',
  },
};

class PlayerExperience extends soundworks.Experience {
  constructor(assetsDomain) {
    super();

    this.platform = this.require('platform', { features: ['web-audio'] });
    this.sharedParams = this.require('shared-params');
    this.audioBufferManager = this.require('audio-buffer-manager', {
      assetsDomain: assetsDomain,
      files: ['sounds/ping.wav'],
    });

    this.runningState = null;
    this.state = null;

    this.onRaiseHand = this.onRaiseHand.bind(this);
    this.onGetReady = this.onGetReady.bind(this);
    this.onSpeakNow = this.onSpeakNow.bind(this);
    this.onReset = this.onReset.bind(this);
    this.onClick = this.onClick.bind(this);
    this.setRunningState = this.setRunningState.bind(this);
  }

  async start() {
    super.start();

    this.view = new soundworks.SegmentedView(template, model, {}, { id: 'player' });
    await this.show();

    this.setState('init');

    this.receive('raise-hand', this.onRaiseHand)
    this.receive('get-ready', this.onGetReady)
    this.receive('speak-now', this.onSpeakNow)
    this.receive('reset', this.onReset)

    window.addEventListener('click', this.onClick);
    window.addEventListener('touchstart', this.onClick);

    this.sharedParams.addParamListener('running-state', this.setRunningState);
  }

  playSound(pitchRange = 'mid') {
    const source = audioContext.createBufferSource();
    source.connect(audioContext.destination);
    source.buffer = this.audioBufferManager.data[0];
    const pitchBase = (pitchRange === 'low') ? -1200 : ((pitchRange === 'high') ? 1200 : 0);
    const transpose = pitchBase + 200 * Math.floor(Math.random() * 6);
    source.playbackRate.value = centToLin(transpose);
    source.start(audioContext.currentTime);
  }

  setDisplayText(state) {
    const textObj = displayText[state];

    this.view.model.top = textObj.top || '';
    this.view.model.center = textObj.center || '';
    this.view.model.bottom = textObj.bottom || '';

    this.view.render();
  }

  setState(state) {
    if (state !== this.state) {
      if (this.state !== null)
        this.view.$el.classList.remove(`state-${this.state}`);

      this.state = state;
      this.setDisplayText(state);

      this.view.$el.classList.add(`state-${state}`);
    }
  }

  onClick() {
    switch (this.state) {
      case 'idle':
        if (this.runningState === 'running') {
          this.send('request-mic');
          this.setState('request');
        }
        break;

      case 'request':
        this.send('cancel-request');
        this.setState('idle');
        break;
    }
  }

  onRaiseHand() {
    if (this.state === 'request') {
      this.setState('handup');
      this.playSound('mid');
    }
  }

  onGetReady() {
    if (this.state === 'handup') {
      this.setState('ready');
    }
  }

  onSpeakNow() {
    if (this.state === 'ready') {
      this.setState('onair');
      this.playSound('high');
    }
  }

  onReset() {
    this.setState('idle');
    this.playSound('low');
  }

  setRunningState(value) {
    if (value !== this.runningState) {
      switch (value) {
        case 'pre':
          this.setState('init');
          break;

        case 'running':
          this.setState('idle');
          break;

        case 'stop':
          if (this.state === 'request')
            this.setState('idle');
          break;

        case 'end':
          this.setState('end');
          break;
      }

      this.runningState = value;
    }
  }
}

export default PlayerExperience;
