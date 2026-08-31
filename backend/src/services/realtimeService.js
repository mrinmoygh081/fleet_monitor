
function initRealtime() {

}

function emit() {

}

module.exports = {
  initRealtime,
  emitAlertNew: (alert) => emit('alert:new', alert),
  emitAlertCleared: (alert) => emit('alert:cleared', alert),
  emitAlertResolved: (alert) => emit('alert:resolved', alert),
  emitAlertWrong: (alert) => emit('alert:wrong', alert),
  emitTripPosition: (tripId, coordinates, status) => emit('trip:position', { tripId, coordinates, status }),
};
