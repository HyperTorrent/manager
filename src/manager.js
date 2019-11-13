import { EventEmitter } from 'events';
import debug from '@hypertorrent/debug';
import fs from 'fs-extra';
import get from 'simple-get';
import hat from 'hat';
import Torrent from '@hypertorrent/torrent';
import os from 'os';
import pascalcase from 'pascalcase';
import path from 'path';
import pify from 'pify';
import pAll from 'p-all';
import pIf from 'p-if';
import { ThrottleGroup } from 'stream-throttle';
import { name, version } from '../package.json';

const DEFAULT_PORT = 4242;
const DEFAULT_PATH = path.join(os.tmpdir(), name);
const MAX_PEERS = 200;

const noop = () => {};

export default class Manager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.debug = debug(name, this);
    this.debug('new');

    const versionStr = version
      .replace(/\d*./g, (v) => `0${v % 100}`.slice(-2))
      .slice(0, 4);
    this.peerId = `-HT${versionStr}-`.concat(hat(48));
    this.userAgent = `${pascalcase(name)}/${version}`;
    this.path = options.path;
    this.port = options.port || DEFAULT_PORT;
    this.dht = (options.dht !== undefined) ? options.dht : true;

    this.torrentPath = options.torrentPath || DEFAULT_PATH;
    this.maxPeers = options.maxPeers || MAX_PEERS;

    this.downloadRate = options.downloadRate ? options.downloadRate : Number.MAX_SAFE_INTEGER;
    this.uploadRate = options.uploadRate ? options.uploadRate : Number.MAX_SAFE_INTEGER;
    this.downloadThrottle = new ThrottleGroup({ rate: this.downloadRate });
    this.uploadThrottle = new ThrottleGroup({ rate: this.uploadRate });

    this.torrents = [];
  }

  get(infoHash) {
    return this.torrents.find((torrent) => torrent.id === infoHash);
  }

  get numPeers() {
    return this.torrents.reduce((acc, torrent) => acc + torrent.peers.length, 0);
  }

  add(source, options) {
    this.debug('add');

    return fs.pathExists(source)
      .then(pIf(
        (exsist) => exsist,
        () => fs.readFile(source),
        () => pify(get.concat, { multiArgs: true })(source)
          .then(([, data]) => data),
      ))
      .catch(() => source)
      .then((torrentId) => {
        const torrent = new Torrent(torrentId, {
          peerId: this.peerId,
          path: this.path,
          port: this.port,
          dht: this.dht,
          torrentPath: this.torrentPath,
          userAgent: this.userAgent,
          ...options,
        });

        torrent.on('wire', (wire, connection) => {
          const downloadLimit = connection.pipe(this.downloadThrottle.throttle());
          downloadLimit.on('data', noop);

          const uploadThrottle = this.uploadThrottle.throttle();
          uploadThrottle.on('data', noop);
          wire.pipe(uploadThrottle);
        });

        this.torrents.push(torrent);

        return torrent;
      })
      .catch((err) => { this.emit('error', err); });
  }

  start(infoHash) {
    this.debug('start');

    const foundTorrent = this.get(infoHash);
    return foundTorrent.start();
  }

  stop(infoHash) {
    this.debug('stop');

    const foundTorrent = this.get(infoHash);
    return foundTorrent.stop();
  }

  check(infoHash) {
    this.debug('check');

    const foundTorrent = this.get(infoHash);
    return foundTorrent.check();
  }

  startAll() {
    this.debug('start all');
    return pAll(this.torrents.map((torrent) => () => torrent.start()));
  }

  stopAll() {
    this.debug('stop all');
    return pAll(this.torrents.map((torrent) => () => torrent.stop()));
  }

  checkAll() {
    this.debug('verify all');
    this.torrents.forEach((torrent) => { torrent.check(); });
  }

  destroy() {
    this.debug('destroy');
    return pAll(this.torrents.map((torrent) => () => torrent.destroy()));
  }

  progress() {
    return this.torrents.reduce((acc, torrent) => acc + torrent.progress, 0) / this.torrents.length;
  }

  ratio() {
    return this.torrents.reduce((acc, torrent) => acc + torrent.ratio, 0) / this.torrents.length;
  }

  setDownloadRate(rate) {
    this.downloadRate = rate;
    this.downloadThrottle.bucket.bucketSize = rate;
    this.downloadThrottle.bucket.tokensPerInterval = rate;
  }

  setUploadRate(rate) {
    this.uploadRate = rate;
    this.uploadThrottle.bucket.bucketSize = rate;
    this.uploadThrottle.bucket.tokensPerInterval = rate;
  }
}
