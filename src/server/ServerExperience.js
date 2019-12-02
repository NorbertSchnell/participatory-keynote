import { Experience } from 'soundworks/server';
import questions from './config/questions';
import * as wifi from 'wifi-control';
import * as ip from 'ip';

wifi.init({ debug: true });
const wifiState = wifi.getIfaceState();
const ipAddr = ip.address();

class ServerExperience extends Experience {
  constructor() {
    super(['player', 'helper', 'display']);

    this.sharedParams = this.require('shared-params');
    this.audioBufferManager = this.require('audio-buffer-manager');

    this.numPlayers = 0;
    this.pendingRequests = [];
    this.pendingSpeakers = [];
    this.currentHandUp = null;
    this.helperRequired = false;
    this.currentSpeaker = null;

    this.helpers = [null, null, null, null];
    this.freeHelpers = new Set();

    this.questionCategory = null;
    this.unposedQuestionIndices = null;
    this.setRunningState = this.setRunningState.bind(this);
    this.setQuestionCategory = this.setQuestionCategory.bind(this);
  }

  start() {
    this.sharedParams.addParamListener('running-state', this.setRunningState);
    this.sharedParams.addParamListener('question-category', this.setQuestionCategory);
    this.sharedParams.update('server-ip', ipAddr);
    this.sharedParams.update('wifi-ssid', wifiState.ssid);
  }

  enterPlayer(playerClient) {
    const playerData = playerClient.activities[this.id];

    this.numPlayers++;
    this.sharedParams.update('num-players', this.numPlayers);

    playerData.helper = null;

    this.receive(playerClient, 'request-mic', () => {
      if (this.runningState === 'running') {
        this.setPlayerRequest(playerClient);
        this.handleRequests();
        this.updateNumPending();
      }
    })

    this.receive(playerClient, 'cancel-request', () => {
      if (this.runningState === 'running') {
        this.resetPlayerRequest(playerClient);
        this.updateNumPending();
      }
    })
  }

  exitPlayer(playerClient) {
    const playerData = playerClient.activities[this.id];

    this.resetPlayer(playerClient);

    this.numPlayers--;
    this.sharedParams.update('num-players', this.numPlayers);
  }

  enterHelper(helperClient) {
    this.receive(helperClient, 'register-helper', (micIndex) => {
      if (this.helpers[micIndex] === null) {
        const helperData = helperClient.activities[this.id];
        helperData.micIndex = micIndex;
        helperData.currentPlayer = null;
        this.helpers[micIndex] = helperClient;

        this.freeHelpers.add(helperClient);
        this.sharedParams.update(`mic-${micIndex + 1}-state`, 'idle');

        this.receive(helperClient, 'claim-speaker', () => {
          const playerClient = this.currentHandUp;

          if (playerClient)
            this.claimSpeaker(playerClient, helperClient);
        })

        this.receive(helperClient, 'speaker-ready', () => {
          const playerClient = this.currentHandUp;

          if (playerClient)
            this.prepareSpeaker(playerClient, helperClient);
        })

        this.receive(helperClient, 'speaker-done', () => {
          const playerClient = this.currentSpeaker;

          if (playerClient)
            this.terminateSpeaker(playerClient, helperClient);
        })

        this.handleRequests();
        this.updateNumPending();
      }
    });
  }

  exitHelper(helperClient) {
    const helperData = helperClient.activities[this.id];
    const micIndex = helperData.micIndex;

    if (micIndex !== undefined && this.helpers[micIndex] === helperClient) {
      this.helpers[micIndex] = null;
      this.freeHelpers.delete(helperClient);

      const helperData = helperClient.activities[this.id];
      const currentPlayer = helperData.currentPlayer;
      const currentHandUp = this.currentHandUp;

      if (currentPlayer !== null) {
        this.send(currentPlayer, 'reset');
        this.resetPlayer(currentPlayer, false);
      } else if (this.helperRequired && currentHandUp !== null) {
        this.helperRequired = false;
        this.broadcast('helper', null, 'assign-speaker', -1);
        this.send(currentHandUp, 'reset');
        this.resetPlayer(currentHandUp, false);
      }

      this.sharedParams.update(`mic-${micIndex + 1}-state`, '–');
    }
  }

  enterDisplay(displayClient) {

  }

  exitDisplay(displayClient) {

  }

  enter(client) {
    super.enter(client);

    if (client.type === 'player')
      this.enterPlayer(client);
    else if (client.type === 'helper')
      this.enterHelper(client);
    else if (client.type === 'display')
      this.enterDisplay(client);
  }

  exit(client) {
    super.exit(client);

    if (client.type === 'player')
      this.exitPlayer(client);
    else if (client.type === 'helper')
      this.exitHelper(client);
    else if (client.type === 'display')
      this.exitDisplay(client);
  }

  resetRequests() {
    this.pendingRequests = [];
  }

  resetAll() {
    this.pendingRequests = [];
    this.pendingSpeakers = [];
    this.currentHandUp = null;
    this.helperRequired = false;
    this.currentSpeaker = null;

    this.freeHelpers.clear();

    for (let i = 0; i < this.helpers.length; i++) {
      const helper = this.helpers[i];
      if (helper !== null)
        this.resetHelper(helper, false);
    }
  }

  setPlayerRequest(playerClient) {
    this.pendingRequests.push(playerClient);
  }

  resetPlayerRequest(playerClient) {
    const requestQueue = this.pendingRequests;
    const queueIndex = requestQueue.indexOf(playerClient);

    if (queueIndex >= 0) {
      requestQueue.splice(queueIndex, 1);

      return true;
    }

    return false;
  }

  resetPlayerHandUp(playerClient, resetHelper = true) {
    if (playerClient === this.currentHandUp) {
      this.currentHandUp = null;
      this.helperRequired = false;

      if (resetHelper) {
        const playerData = playerClient.activities[this.id];
        const helperClient = playerData.helper;

        if (helperClient) {
          this.resetHelper(helperClient);
        } else {
          this.broadcast('helper', null, 'assign-speaker', -1);
        }
      }

      return true;
    }

    return false;
  }

  resetPlayerReady(playerClient, resetHelper = true) {
    const speakerQueue = this.pendingSpeakers;
    const queueIndex = speakerQueue.indexOf(playerClient);

    if (queueIndex >= 0) {
      const playerClient = speakerQueue.splice(queueIndex, 1)[0];
      const playerData = playerClient.activities[this.id];
      const helperClient = playerData.helper;

      if (resetHelper && helperClient)
        this.resetHelper(helperClient);

      return true;
    }

    return false;
  }

  resetPlayerSpeaking(playerClient, resetHelper = true) {
    if (playerClient !== null && playerClient === this.currentSpeaker) {
      this.currentSpeaker = null;
      this.sharedParams.update('current-question', '');

      const playerData = playerClient.activities[this.id];
      const helperClient = playerData.helper;

      if (resetHelper && helperClient)
        this.resetHelper(helperClient);

      return true;
    }

    return false;
  }

  resetPlayer(playerClient, resetHelper = true) {
    const hasReset = this.resetPlayerRequest(playerClient) ||
      this.resetPlayerHandUp(playerClient, resetHelper) ||
      this.resetPlayerReady(playerClient, resetHelper) ||
      this.resetPlayerSpeaking(playerClient, resetHelper);

    if (hasReset) {
      this.sharedParams.update('num-players', this.numPlayers);
      this.handleRequests();
      this.handleSpeakers();
      this.updateNumPending();
    }
  }

  resetHelper(helperClient, resetClient = true) {
    const helperData = helperClient.activities[this.id];
    helperData.currentPlayer = null;

    const micIndex = helperData.micIndex;
    this.sharedParams.update(`mic-${micIndex + 1}-state`, 'idle');

    if (resetClient)
      this.send(helperClient, 'reset');

    this.freeHelpers.add(helperClient);
  }

  handleRequests() {
    if (this.runningState === 'running' && this.pendingRequests.length > 0 && this.freeHelpers.size > 0 && this.currentHandUp === null) {
      const playerClient = this.pendingRequests.shift();
      const playerData = playerClient.activities[this.id];

      this.send(playerClient, 'raise-hand');
      this.currentHandUp = playerClient;
      this.helperRequired = true;

      if (this.freeHelpers.size > 1) {
        this.broadcast('helper', null, 'compete-for-speaker');
      } else {
        const helperClient = this.freeHelpers.values().next().value;
        this.claimSpeaker(playerClient, helperClient)
      }
    }
  }

  claimSpeaker(playerClient, helperClient) {
    if (this.helperRequired) {
      this.helperRequired = false;

      const playerData = playerClient.activities[this.id];
      playerData.helper = helperClient; // assign helper to player

      this.freeHelpers.delete(helperClient);

      const helperData = helperClient.activities[this.id];
      helperData.currentPlayer = playerClient;

      const micIndex = helperData.micIndex;
      this.sharedParams.update(`mic-${micIndex + 1}-state`, 'hand out');

      this.broadcast('helper', null, 'assign-speaker', micIndex);
    }
  }

  prepareSpeaker(playerClient, helperClient) {
    this.pendingSpeakers.push(playerClient);
    this.currentHandUp = null;

    const helperData = helperClient.activities[this.id];
    const micIndex = helperData.micIndex;
    this.sharedParams.update(`mic-${micIndex + 1}-state`, 'ready');

    this.send(playerClient, 'get-ready');
    this.handleRequests();
    this.handleSpeakers();
    this.updateNumPending();
  }

  handleSpeakers() {
    if (this.pendingSpeakers.length > 0 && this.currentSpeaker === null) {
      const playerClient = this.pendingSpeakers.shift();
      const playerData = playerClient.activities[this.id];
      const helperClient = playerData.helper;

      if (helperClient) {
        this.send(playerClient, 'speak-now');
        this.send(helperClient, 'speaker-onair');

        const helperData = helperClient.activities[this.id];
        const micIndex = helperData.micIndex;
        this.sharedParams.update(`mic-${micIndex + 1}-state`, 'on air');

        const currentQuestion = this.getQuestion();
        this.sharedParams.update('current-question', currentQuestion);
      }

      this.currentSpeaker = playerClient;
    } else if (this.pendingSpeakers.length === 0 && this.currentSpeaker === null && this.currentHandUp === null && this.runningState === 'stop') {
      this.sharedParams.update('running-state', 'end');
    }

    this.updateNumPending();
  }

  terminateSpeaker(playerClient, helperClient) {
    this.resetPlayerSpeaking(playerClient, false);
    this.send(playerClient, 'reset');

    this.resetHelper(helperClient, false);

    this.handleRequests();
    this.handleSpeakers();
    this.updateNumPending();
  }

  updateNumPending() {
    const numPending = this.pendingRequests.length + this.pendingSpeakers.length + (this.currentHandUp !== null);

    if (numPending !== this.numPending) {
      this.sharedParams.update('num-pending', numPending);
    }
  }

  getQuestion() {
    const questionCategory = this.questionCategory;
    const questionSet = questions[questionCategory];
    const unposedQuestionIndices = this.getUnposedQuestionIndices();
    const numUnposedQuestionIndices = unposedQuestionIndices.length;
    const unposedIndex = Math.floor(Math.random() * numUnposedQuestionIndices);
    const questionIndex = unposedQuestionIndices.splice(unposedIndex, 1)[0];

    return questionSet[questionIndex];
  }

  getUnposedQuestionIndices() {
    let unposedQuestionIndices = this.unposedQuestionIndices;

    if (!this.unposedQuestionIndices || this.unposedQuestionIndices.length === 0) {
      const questionSet = questions[this.questionCategory];

      if (!unposedQuestionIndices)
        unposedQuestionIndices = [];

      for (let i = 0; i < questionSet.length; i++)
        unposedQuestionIndices.push(i);

      this.unposedQuestionIndices = unposedQuestionIndices;
    }

    return unposedQuestionIndices;
  }

  setRunningState(value) {
    if (value !== this.runningState) {
      switch (value) {
        case 'pre':
        case 'running':
          this.resetAll();
          break;

        case 'stop':
          this.resetRequests();
          break;
      }

      this.runningState = value;
      this.handleSpeakers();
    }
  }

  setQuestionCategory(value) {
    this.questionCategory = value;
    this.unposedQuestionIndices = null;
  }
}

export default ServerExperience;
