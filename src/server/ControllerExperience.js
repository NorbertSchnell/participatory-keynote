import { Experience } from 'soundworks/server';

class ControllerExperience extends Experience {
  constructor(options = {}) {
    super('controller', { auth: false });

    this.sharedParams = this.require('shared-params');
    this.errorReporter = this.require('error-reporter');
    this.auth = this.require('auth');
  }

  start() {
    this.errorReporter.addListener('error', (file, line, col, msg, userAgent) => {
      this.broadcast('controller', null, 'log', 'error', file, line, col, msg, userAgent);
    });
  }
}

export default ControllerExperience;
