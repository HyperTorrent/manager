# Manager

```bash
npm i @hypertorrent/manager
```

Usage :
```javascript
import TorrentsManager from '@hypertorrent/manager';

const torrentsManager = new TorrentsManager();
torrentsManager
  .add('magnet:?xt=urn:btih:7c312dd630e216b10e87c82a9624e38eac4bac4b&dn=archlinux-2019.11.01-x86_64.iso&tr=udp://tracker.archlinux.org:6969&tr=http://tracker.archlinux.org:6969/announce', { dht: true });
```
