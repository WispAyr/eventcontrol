const eventController = require('../controllers/event');
const { auth } = require('../middleware/auth');

// Event routes
ROUTE('GET     /api/events',              auth, eventController.list);
ROUTE('GET     /api/events/{id}',         auth, eventController.getById);
ROUTE('POST    /api/events',              auth, eventController.create);
ROUTE('PUT     /api/events/{id}',         auth, eventController.update);
ROUTE('PATCH   /api/events/{id}/status',  auth, eventController.updateStatus);
ROUTE('DELETE  /api/events/{id}',         auth, eventController.delete); 