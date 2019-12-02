import * as soundworks from 'soundworks/client';

const audioContext = soundworks.audioContext;

const template = `
  <div class="section-top">
    <h1>WAC 2019 Participatory Keynote Address</h1>
  </div>
  <div class="section-center">
    <div class="question">
      <table>
        <tr><td class="arrow">
        <% if (question !== "") { %>
          →
        <% } %>          
        </td><td><%= question %></td></td></tr>
      </table>
    </div>
  </div>
  <div class="section-bottom">
    <div class="instructions">
      <h1>Instructions</h1>
      <ul>
         <li>Connect your mobile device to the <b><%= ssid %></b> Wi-Fi network.</li>
         <li>Open the URL http://<b><%= url %></b>/ in your mobile browser.</li>
         <li>Make sure that sound is <b>not muted</b> and at <b>maximum volume</b>.</li>
         <li>Make sure that you mobile device <b>doesn't fall asleep</b> during the session.</li>
         <li>Follow the instructions on your screen.</li>
         <li><b>Listen</b> to each other...</li>
      </ul>
      <p>If anything seems wrong, consider reloading the page at the above URL at any time.</p>
    </div>
  </div>
`;

const model = {
  ssid: '',
  url: '',
  question: '',
};

class DisplayExperience extends soundworks.Experience {
  constructor(assetsDomain) {
    super();

    this.platform = this.require('platform', { features: ['web-audio'] });
    this.sharedParams = this.require('shared-params');
    this.audioBufferManager = this.require('audio-buffer-manager', {
      assetsDomain: assetsDomain,
      files: [ /* ... */ ],
    });

    this.setUrl = this.setUrl.bind(this);
    this.setSsid = this.setSsid.bind(this);
    this.setQuestion = this.setQuestion.bind(this);
  }

  async start() {
    super.start();

    this.view = new soundworks.SegmentedView(template, model, {}, {
      id: 'display',
      ratios: {
        '.section-top': 0.1,
        '.section-center': 0.4,
        '.section-bottom': 0.5,
      }
    });

    await this.show();

    this.sharedParams.addParamListener('server-ip', this.setUrl);
    this.sharedParams.addParamListener('wifi-ssid', this.setSsid);
    this.sharedParams.addParamListener('current-question', this.setQuestion);
  }

  setUrl(value) {
    this.view.model.url = value;
    this.view.render();
  }

  setSsid(value) {
    this.view.model.ssid = value;
    this.view.render();
  }

  setQuestion(value) {
    this.view.model.question = value;
    this.view.render();
  }
}

export default DisplayExperience;
