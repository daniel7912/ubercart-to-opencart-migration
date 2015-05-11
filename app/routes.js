var _ = require('lodash'),
	async = require('async'),
	config = require('../config/index.js'),
    fs = require('fs'),
    migration = require('./migration-scripts.js'),
    mysql = require('mysql');
    
module.exports = function(app, express, server, io) {

	var router = express.Router();

	/***
	*
	* API Routes
	*
	***/

	io.on('connection', function (socket) {
		socket.on('start', function() {

			socket.emit('status', 'Starting Migration..');

			async.series([

				function(callback) {

					if (config.truncate_databases == true) {

						migration.truncate_tables(function() {
							callback();
						});

					} else {
						callback();
					}

				},

				function(callback) {

					var migrationParts = ['users', 'options', 'products', 'vocabulary', 'category_paths', 'product_categories', 'product_options', 'product_images', 'orders', 'order_history', 'seo_urls'];

					async.eachSeries(migrationParts, function(part, cb) {

						migration[part](socket, cb);

					}, function(err) {
						if (err) { console.log(err); }
						callback();
					});

				}

			], function(err, results) {

				if (err) { console.log(err); }
				socket.emit('status', 'Finished');

			});

		});
	});

	router.get('/', function(req, res) {
		res.json({ message: 'Welcome to the API' });
	});

	
	app.get('*', function(req, res) {
		res.render('index');
	});
	
}