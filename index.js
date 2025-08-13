// Auto-Pet Feeder (Patch 31) — feeds under 70%, skip while mounted; commands: /8 autopet on|off|status|sign on|sign off|sign now

module.exports = function autoPet(mod) {
  var command = mod.command;

  // SIGN (mod.log)
  var signOnConnect = true;
  var signedThisLogin = false;
  var sign = [
    "       / \\__                                      by Szariel",
    "      (    @\\___",
    "      /         O                         https://github.com/Szariel",
    "      /   (_____/",
    "     /_____/   U        Use: /8 autopet on | off | status | sign on | sign off | sign now"
  ];
  function showSigning() {
    try {
      mod.log("──────── Auto-Pet Feeder ────────");
      for (var i = 0; i < sign.length; i++) mod.log(sign[i]);
    } catch (e) {}
  }
  function signOnceSoon() {
    if (!signOnConnect || signedThisLogin) return;
    signedThisLogin = true;
    setTimeout(showSigning, 1200);
  }
  try { if (mod.game && mod.game.on) mod.game.on('enter_game', signOnceSoon); } catch (e) {}
  try { mod.hook('S_LOGIN', '*', function () { signOnceSoon(); }); } catch (e) {}
  try { if (mod.game && mod.game.on) mod.game.on('leave_game', function () { signedThisLogin = false; }); } catch (e) {}

  // Settings
  var PET_FOOD_ID = 213307;
  var FEED_THRESHOLD = 70;
  var CHECK_INTERVAL = 5000;
  var FEED_COOLDOWN_MS = 10000;
  var USE_ITEM_VER = '*';

  // State
  var enabled = true;
  var energy = 100;
  var maxEnergy = null;
  var petActive = false;
  var mounted = false;
  var lastFeedAt = 0;
  var interval = null;

  function myGameId() {
    return (mod.game && mod.game.me && mod.game.me.gameId) || mod.gameId || 0n;
  }

  // Commands
  command.add('autopet', function (arg) {
    arg = (arg || '').toLowerCase();

    if (arg === 'sign on')  { signOnConnect = true;  command.message('Signing (mod.log): ON'); return; }
    if (arg === 'sign off') { signOnConnect = false; command.message('Signing (mod.log): OFF'); return; }
    if (arg === 'sign now') { showSigning(); return; }

    if (arg === 'on')  { enabled = true;  startLoop(); command.message('Auto-Pet: ON'); return; }
    if (arg === 'off') { enabled = false; stopLoop();  command.message('Auto-Pet: OFF'); return; }

    if (arg === 'status') {
      var max = (maxEnergy != null ? maxEnergy : 100);
      var pct = Math.max(0, Math.min(100, Math.round((energy / max) * 100)));
      command.message(
        'Auto-Pet Status: ' +
        (enabled ? 'ON' : 'OFF') +
        ' | Pet: ' + (petActive ? 'active' : 'inactive') +
        ' | Mount: ' + (mounted ? 'yes' : 'no') +
        ' | Energy: ' + energy + '/' + max + ' (' + pct + '%)' +
        ' | Signing: ' + (signOnConnect ? 'ON' : 'OFF')
      );
      return;
    }

    // toggle
    enabled = !enabled;
    enabled ? startLoop() : stopLoop();
    command.message('Auto-Pet: ' + (enabled ? 'ON' : 'OFF') + ' (toggle) — "/8 autopet on|off|status|sign on/off/now"');
  });

  // Periodic check
  function startLoop() {
    if (interval) return;
    try {
      if (mod.game && mod.game.me && typeof mod.game.me.mounted === 'boolean') {
        mounted = mod.game.me.mounted;
      }
    } catch (e) {}
    interval = setInterval(function () {
      var max = (maxEnergy != null ? maxEnergy : 100);
      var pct = Math.max(0, Math.min(100, Math.round((energy / max) * 100)));
      if (enabled && petActive && !mounted && pct < FEED_THRESHOLD) feedPet();
    }, CHECK_INTERVAL);
  }
  function stopLoop() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
  }

  // Pet presence
  try {
    mod.hook('S_SPAWN_SERVANT', '*', function (e) {
      var owner = (e.owner != null ? e.owner : (e.ownerId != null ? e.ownerId : 0n));
      if (owner === myGameId()) {
        petActive = true;
        if (typeof e.energy === 'number') energy = e.energy;
        if (typeof e.maxEnergy === 'number') maxEnergy = e.maxEnergy;
      }
    });
  } catch (e) {}
  try { mod.hook('S_DESPAWN_SERVANT', '*', function () { petActive = false; }); } catch (e) {}
  try {
    mod.hook('S_SPAWN_PET', '*', function (e) {
      var owner = (e.owner != null ? e.owner : (e.gameId != null ? e.gameId : 0n));
      if (owner === myGameId()) petActive = true;
    });
  } catch (e) {}
  try { mod.hook('S_DESPAWN_PET', '*', function () { petActive = false; }); } catch (e) {}
  try { mod.hook('S_WELCOME_PET_OWNER', '*', function () {}); } catch (e) {}

  // Energy updates
  try {
    mod.hook('S_CHANGE_SERVANT_ENERGY', '*', function (e) {
      if (typeof e.energy === 'number') energy = e.energy;
      if (typeof e.maxEnergy === 'number') {
        maxEnergy = e.maxEnergy;
      } else if (maxEnergy === null || energy > maxEnergy) {
        maxEnergy = energy;
      }
    });
  } catch (e) {
    mod.log('[Auto-Pet] Warning: S_CHANGE_SERVANT_ENERGY not found — check opcodes/defs.');
  }

  // Mount status
  try { mod.hook('S_MOUNT_VEHICLE', '*', function (e) { if (e.gameId === myGameId()) mounted = true; }); } catch (e) {}
  try { mod.hook('S_UNMOUNT_VEHICLE', '*', function (e) { if (e.gameId === myGameId()) mounted = false; }); } catch (e) {}
  try {
    if (mod.game && typeof mod.game.on === 'function') {
      mod.game.on('update', function () {
        try {
          if (mod.game && mod.game.me && typeof mod.game.me.mounted === 'boolean') {
            mounted = mod.game.me.mounted;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  // Feeding
  function feedPet() {
    var now = Date.now();
    if (now - lastFeedAt < FEED_COOLDOWN_MS) return;
    if (mounted) return;
    lastFeedAt = now;

    var max = (maxEnergy != null ? maxEnergy : 100);
    var pct = Math.max(0, Math.min(100, Math.round((energy / max) * 100)));
    mod.log('[Auto-Pet] Energy ' + pct + '% < ' + FEED_THRESHOLD + '% → feeding (item ' + PET_FOOD_ID + ')…');

    try {
      mod.toServer('C_USE_ITEM', USE_ITEM_VER, {
        gameId: myGameId(),
        id: PET_FOOD_ID,
        dbid: 0,
        target: 0n,
        amount: 1,
        dest: { x: 0, y: 0, z: 0 },
        loc:  { x: 0, y: 0, z: 0 },
        w: 0,
        unk4: true
      });
    } catch (e) {
      mod.log('[Auto-Pet] Error sending C_USE_ITEM: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Autostart
  startLoop();

  this.destructor = function () {
    stopLoop();
    try { command.remove('autopet'); } catch (e) {}
  };
}
