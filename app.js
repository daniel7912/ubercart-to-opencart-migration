/*****************************************************************
***
*** Module Dependencies
***
******************************************************************/

var express = require('express'),
	session = require('express-session'),
	config = require('./config'),
	app = express(),
	http = require('http'),
	server = http.createServer(app),
	path = require('path'),
	io = require('socket.io')(server);

/* Configure Express Application ******************************************/

// all environments
app.set('port', process.env.PORT || 3020);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.static('public'));
app.use(session({
	secret: 'keyboard cat',
	resave: true,
	saveUninitialized: true
}))

/* Get the routes ********************************************************/
require('./app/routes.js')(app, express, server, io);

/*****************************************************************
***
*** Database Connection with Sequelize
***
******************************************************************/

server.listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});