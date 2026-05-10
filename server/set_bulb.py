import sys, json, argparse, tinytuya
BULBS = {
    'bedroom':        {'id': 'd7e7212acc0425c719jhzh', 'key': 'YcWq_Bq2&=W7[aOh',  'ip': '192.168.1.5'},
    'hall':           {'id': 'd779f624e271236eeeiogr', 'key': '[d;/L.EBXQ@?&b_6',  'ip': '192.168.1.16'},
    'washingmachine': {'id': 'd75d679deb6e48e3c6ylwa', 'key': 'JmPNyLh+Huf>_>Is',  'ip': '192.168.1.4'},
}
parser = argparse.ArgumentParser()
parser.add_argument('bulb_id')
parser.add_argument('--power', choices=['on','off'])
parser.add_argument('--brightness', type=int)
parser.add_argument('--temp', type=int)
parser.add_argument('--hue', type=int)
parser.add_argument('--sat', type=int, default=1000)
parser.add_argument('--val', type=int, default=1000)
args = parser.parse_args()
cfg = BULBS.get(args.bulb_id)
if not cfg:
    sys.exit(1)
d = tinytuya.BulbDevice(dev_id=cfg['id'], address=cfg['ip'], local_key=cfg['key'], version=3.5)
d.set_socketTimeout(1.5)
d.set_socketRetryLimit(1)
dps = {}
if args.power == 'off':
    dps['20'] = False
else:
    if args.power == 'on': dps['20'] = True
    if args.hue is not None:
        dps['21'] = 'colour'
        dps['24'] = json.dumps({'h': args.hue, 's': args.sat, 'v': args.val})
    else:
        if args.brightness is not None or args.temp is not None: dps['21'] = 'white'
        if args.brightness is not None: dps['22'] = max(10, min(1000, args.brightness))
        if args.temp is not None: dps['23'] = max(0, min(1000, args.temp))
if dps:
    d.set_multiple_values(dps, nowait=True)
    print('ok')