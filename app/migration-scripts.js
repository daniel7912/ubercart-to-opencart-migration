var fs = require('fs'),
	moment = require('moment'),
	config = require('../config/index.js'),
	mysql = require('mysql'),
	PHPUnserialize = require('php-unserialize'),
	request = require('request'),
	async = require('async'),
	asyncEachObject = require('async-each-object');

var ubercart_db = mysql.createConnection({
	host: config.ubercart_database.db_host,
	database: config.ubercart_database.db_name,
	user: config.ubercart_database.db_user,
	password: config.ubercart_database.db_password
});

var opencart_db = mysql.createConnection({
	host: config.opencart_database.db_host,
	database: config.opencart_database.db_name,
	user: config.opencart_database.db_user,
	password: config.opencart_database.db_password,
	multipleStatements: true
});

/************************************************************
***
*** TRUNCATE TABLES
*** If the truncate_databases option in config.js is set to true,
*** we will empty out all tables we are going to be inserting data into.
***
*************************************************************/

exports.truncate_tables = function(callback) {

	var truncate_sql = '\
		TRUNCATE oc_attribute;\
		TRUNCATE oc_attribute_description;\
		TRUNCATE oc_customer;\
		TRUNCATE oc_option;\
		TRUNCATE oc_option_description;\
		TRUNCATE oc_option_value;\
		TRUNCATE oc_option_value_description;\
		TRUNCATE oc_product;\
		TRUNCATE oc_product_to_store;\
		TRUNCATE oc_product_to_layout;\
		TRUNCATE oc_product_description;\
		TRUNCATE oc_product_attribute;\
		TRUNCATE oc_category;\
		TRUNCATE oc_category_description;\
		TRUNCATE oc_category_to_store;\
		TRUNCATE oc_category_to_layout;\
		TRUNCATE oc_category_path;\
		TRUNCATE oc_product_to_category;\
		TRUNCATE oc_product_option;\
		TRUNCATE oc_product_option_value;\
		TRUNCATE oc_order;\
		TRUNCATE oc_order_product;\
		TRUNCATE oc_order_option;\
		TRUNCATE oc_order_total;\
		TRUNCATE oc_order_history;\
		TRUNCATE oc_url_alias;\
	';

	opencart_db.query(truncate_sql, function(err, result, fields) {
		if (err) { console.log(err); }
		callback();
	});

}

/************************************************************
***
*** USER MIGRATION
*** Import data from ubercart (table users) to Opencart (table oc_customers)
***
*************************************************************/

exports.users = function(socket, callback) {

	console.log('migrate users');
	socket.emit('status', 'Migrating Users');

	var i = 0;
	var date = new Date();

	// First, get a list of users from ubercart
	ubercart_db.query('SELECT * FROM users', function(err, users, fields) {
		if (err) { console.log(err); }

		// Next, loop through each user and insert it into the opencart database
		async.eachSeries(users, function(user, cb) {

			if (user.uid == 0) {
				cb();
			} else {

				opencart_db.query('INSERT INTO oc_customer SET ?',
					{
						customer_id: user.uid,
						customer_group_id: '1',
						store_id: '0',
						firstname: user.name,
						lastname: '',
						email: user.mail,
						telephone: '',
						fax: '',
						password: user.pass,
						salt: '',
						cart: 'a:0:{}',
						wishlist: null,
						newsletter: '0',
						address_id: '0',
						custom_field: '',
						ip: '0',
						status: '1',
						approved: '1',
						safe: '0',
						token: '',
						date_added: date
					},
				function(err, result) {
					if (err) {
						console.log(err);
					}
					i++;
					socket.emit('progress', (100 / users.length) * i);
					cb();
				});

			}

		}, function(err) {
			if (err) { console.log(err); }
			callback();
		});

	});
	

}

/************************************************************
***
*** OPTIONS MIGRATION
***
*** Step 1 - Find different options and insert them into opencart
*** Step 2 - Use the insert ID to create description field in oc_option_description
*** Step 3 - Go through each variation of the option and insert into oc_option_value
*** Step 4 - Use the oc_option_value insert id to create oc_option_value_description entry
***
*************************************************************/

exports.options = function(socket, callback) {

	console.log('migrate options');
	socket.emit('status', 'Migrating Options');

	var i = 0;

	// First, get a list of the options from ubercart
	ubercart_db.query('SELECT * FROM uc_attributes', function(err, uc_attributes, fields) {

		// Next, loop through each option and insert it into opencart.
		// This requires entries in the oc_option, oc_option_description, oc_option_value & oc_option_value_description tables
		async.eachSeries(uc_attributes, function(option, cb) {

			// 1st Insert -  Insert into oc_option
			opencart_db.query('INSERT INTO oc_option SET ?',
				{
					option_id: option.aid,
					type: 'select',
					sort_order: '0'
				},
			function(err) {
				if (err) { console.log(err); }

				// 2nd Insert - Once that's finished, insert into oc_option_description
				opencart_db.query('INSERT INTO oc_option_description SET ?',
					{
						option_id: option.aid,
						language_id: '1',
						name: option.name
					},
				function(err) {
					if (err) { console.log(err); }

					// Next, we need to select the option values by name
					ubercart_db.query('SELECT attribute_options.oid, attribute_options.name FROM uc_attributes AS attributes LEFT JOIN uc_attribute_options AS attribute_options ON attributes.aid=attribute_options.aid WHERE attributes.name = ?', [option.name],
						function(err, attributes) {
							if (err) { console.log(err); }

							var i = 0;

							// Then, loop through selected attributes and insert this information into oc_option_value and oc_option_value_description

							async.eachSeries(attributes, function(attribute, cb2) {

								opencart_db.query('INSERT INTO oc_option_value SET ?',
									{
										option_value_id: attribute.oid,
										option_id: option.aid,
										image: '',
										sort_order: i
									},
								function(err) {

									if (err) { console.log(err); }

									opencart_db.query('INSERT INTO oc_option_value_description SET ?',
										{
											option_value_id: attribute.oid,
											language_id: '1',
											option_id: option.aid,
											name: attribute.name
										},
									function(err) {

										if (err) { console.log(err); }
										i++;
										cb2();

									});

								});

							}, function(err) {
								if (err) { console.log(err); }
								i++;
								socket.emit('progress', (100 / uc_attributes.length) * i);
								cb();
							});

							
							

						});

				});

			});

		}, function(err) {
			if (err) { console.log(err); }
			callback();
		});

	});

}

/************************************************************
***
*** PRODUCTS MIGRATION
***
*************************************************************/

exports.products = function(socket, callback) {

	console.log('migrate products');
	socket.emit('status', 'Migrating Products');

	var i = 0;

	var products_query = '\
		SELECT \
			uc_products.nid as product_id,\
			uc_products.model,\
			uc_products.sell_price,\
			uc_products.weight,\
			uc_products.height,\
			uc_products.length,\
			uc_products.width,\
			uc_products.length_units,\
			product_stock.stock as stock,\
			product_care.title as product_care,\
			product_description.title as product_title,\
			product_description.body as product_description,\
			product_delivery.title as product_delivery,\
			product_description.timestamp\
		FROM uc_products\
			LEFT JOIN node ON uc_products.vid = node.vid \
			LEFT JOIN uc_product_stock AS product_stock ON node.nid = product_stock.nid\
			LEFT JOIN content_type_product ON content_type_product.nid = node.nid\
			LEFT JOIN node_revisions AS product_description ON product_description.nid = uc_products.nid\
			LEFT JOIN node_revisions AS product_delivery ON product_delivery.nid = content_type_product.field_product_delivery_nid\
			LEFT JOIN node_revisions AS product_care ON product_care.nid = content_type_product.field_product_care_info_nid\
		GROUP BY product_id\
		ORDER BY product_id ASC';

	ubercart_db.query(products_query, function(err, products, fields) {

		if (err) { console.log('Products query error - '+err); }

		async.eachSeries(products, function(product, cb) {

			// Set up conditional variables for current product
			if (product.stock > 0) {
				var quantity = product.stock;
				var subtract = '1';
			} else {
				var quantity = '1';
				var subtract = '0';
			}

			if (product.product_delivery == 'Stock Item: 5 Working Days ' || product.product_delivery == 'Non Stock Item: 5 Working Days') {
				var stock_status = '6';
			} else if (product.product_delivery == 'Stock Item: 5-10 Working Days' || product.product_delivery == 'Non Stock Item: 5-10 Working Days') {
				var stock_status = '9';
			} else if (product.product_delivery == 'Stock Item: 7-14 Working Days' || product.product_delivery == 'Non Stock Item: 7-14 Working Days') {
				var stock_status = '10';
			} else {
				var stock_status = '7';
			}

			var todaysDate = moment().format('l');
			var timeCreated = new Date(product.timestamp*1000)

			opencart_db.query('INSERT INTO oc_product SET ?',
				{
					product_id: product.product_id,
					model: product.model,
					sku: product.model,
					upc: '',
					ean: '',
					jan: '',
					isbn: '',
					mpn: '',
					location: '',
					quantity: quantity,
					stock_status_id: stock_status,
					image: '',
					manufacturer_id: '0',
					shipping: '1',
					price: product.sell_price,
					points: '0',
					tax_class_id: '1',
					date_available: todaysDate,
					weight: product.weight,
					weight_class_id: '1',
					length: product.length,
					width: product.width,
					height: product.height,
					length_class_id: '1',
					subtract: subtract,
					minimum: '1',
					sort_order: '0',
					status: '1',
					viewed: '0',
					date_added: timeCreated,
					date_modified: timeCreated
				},
			function(err) {
				if (err) { console.log('Products insert error - '+err); }

				// Once the product is inserted, add it to the store
				opencart_db.query('INSERT INTO oc_product_to_store SET ?',
					{
						product_id: product.product_id,
						store_id: '0'
					},
				function(err) {
					if (err) { console.log('Products to store error - '+err); }

					// Next, insert into the oc_product_to_layout table
					opencart_db.query('INSERT INTO oc_product_to_layout SET ?',
						{
							product_id: product.product_id,
							store_id: '0',
							layout_id: '0'
						},
					function(err) {
						if (err) { console.log('Products to layout error - '+err); }

						// Next, insert the product description
						opencart_db.query('INSERT INTO oc_product_description SET ?',
							{
								product_id: product.product_id,
								language_id: '1',
								name: product.product_title,
								description: product.product_description,
								tag: '',
								meta_title: product.product_title,
								meta_description: product.product_description,
								meta_keyword: ''
							},
						function(err) {
							if (err) { console.log('Products description error - '+err); }
							cb();
						});
						

					});

				});

			});

		}, function(err) {
			if (err) { console.log(err); }
			callback();
		});

	});

}

/************************************************************
***
*** CATEGORY / VOCABULARY MIGRATION
***
*************************************************************/

var vocabulary_inserts = function(categoryID, parentID, description, name, todaysDate, callback) {

	async.series([
		function(series_cb) {

			// First, set up the category
			opencart_db.query('INSERT INTO oc_category SET ?',
				{
					category_id: categoryID,
					image: '',
					parent_id: parentID,
					top: '0',
					column: '4',
					sort_order: '0',
					status: '1',
					date_added: todaysDate,
					date_modified: todaysDate
				},
			function(err) {
				if (err) { console.log('Vocabulary insert error - '+err); }
				series_cb();
			});

		},

		function(series_cb) {

			// Next, insert the category description
			opencart_db.query('INSERT INTO oc_category_description SET ?',
				{
					category_id: categoryID,
					language_id: '1',
					name: name,
					description: description,
					meta_title: name,
					meta_description: description,
					meta_keyword: ''
				},
			function(err) {
				if (err) { console.log('Vocabulary description insert error - '+err); }
				series_cb();
			});

		},

		function(series_cb) {

			// Next, link the category to the store
			opencart_db.query('INSERT INTO oc_category_to_store SET ?',
				{
					category_id: categoryID,
					store_id: '0'
				},
			function(err) {
				if (err) { console.log('Vocabulary to store error - '+err); }
				series_cb();
			});

		},

		function(series_cb) {

			// Next, link the category to the layout
			opencart_db.query('INSERT INTO oc_category_to_layout SET ?',
				{
					category_id: categoryID,
					store_id: '0',
					layout_id: '0'
				},
			function(err) {
				if (err) { console.log('Vocabulary to layout error - '+err); }
				series_cb();
			});

		}
	],
	function(err, results) {

		callback();

	});

}

exports.vocabulary = function(socket, callback) {

	console.log('migrate vocabulary');
	socket.emit('status', 'Migrating Vocabulary');

	var i = 0;

	var todaysDate = new Date();

	ubercart_db.query('SELECT * FROM vocabulary	WHERE vocabulary.module = "taxonomy"', function(err, vocabulary, fields) {

		if (err) { console.log('Vocabulary select error - '+err); }

		async.eachSeries(vocabulary, function(v, toplevel_cb) {

			// vocabularyID could be 5 for designer, 6 for product etc
			var vocabularyID = v.vid;
			var subVocabularyID;

			vocabulary_inserts(vocabularyID, '0', v.description, v.name, todaysDate, function() {
			
				// Next, find sub vocabulary attached to the main term
				var sub_vocabulary_sql = 'SELECT\
											term_data.tid as term_id,\
											term_data.vid,\
											term_data.name,\
											term_data.description,\
											term_data.weight,\
											term_hierarchy.parent as parent\
										FROM vocabulary\
											LEFT JOIN term_data as term_data ON term_data.vid=vocabulary.vid\
											LEFT JOIN term_hierarchy as term_hierarchy ON term_hierarchy.tid=term_data.tid\
										WHERE vocabulary.vid = ?';

				ubercart_db.query(sub_vocabulary_sql, [vocabularyID], function(err, sub_vocabulary, fields) {

					if (err) { console.log('Sub vocabulary select error - '+err); }

					async.eachSeries(sub_vocabulary, function(sv, sublevel_cb) {

						if (sv.parent == '0') {
							var parentID = vocabularyID;
						} else {
							var parentID = sv.parent;
						}

						vocabulary_inserts(sv.term_id, parentID, sv.description, sv.name, todaysDate, function() {
							sublevel_cb();
						});

					}, function(err) {
						if (err) { console.log('Async sub vocabulary error - '+err); }
						i++;
						socket.emit('progress', (100 / vocabulary.length) * i);
						toplevel_cb();
					});

				});

			});

		}, function(err) {
			callback();
		});

	});

}

/************************************************************
***
*** CATEGORY PATHS MIGRATION
***
*************************************************************/

var vocabulary_path_inserts = function(categoryID, pathIDs, callback) {

	var i = 0;

	async.whilst(
		function() {
			return i < pathIDs.length;
		},
		function(cb) {

			opencart_db.query('INSERT INTO oc_category_path SET ?',
				{
					category_id: categoryID,
					path_id: pathIDs[i],
					level: i
				},
			function(err) {
				if (err) { console.log('Vocabulary path inserts error - '+err); }
				i++;
				cb();
			});

		},
		function(err) {
			callback();
		}
	);

}

exports.category_paths = function(socket, callback) {

	console.log('migrate category paths');
	socket.emit('status', 'Migrating Category Paths');

	var i = 0;

	ubercart_db.query('SELECT * FROM term_data', function(err, term_data, fields) {

		async.eachSeries(term_data, function(td, cb) {

			var paths = [];
			paths.push(td.tid);

			// Go through each individual term, then add it's parent, then the parent's parent etc.
			ubercart_db.query('SELECT * FROM term_hierarchy WHERE tid = ?', [td.tid], function(err, term_hierarchy, fields) {

				paths.push(term_hierarchy[0].parent);

				var currentTerm = term_hierarchy[0].parent;

				async.whilst(
					function() {

						return currentTerm !== 0;

					},
					function(whilst_cb) {

						ubercart_db.query('SELECT * FROM term_hierarchy WHERE tid = ?', currentTerm, function(err, sub_level, fields) {

							if (err) { console.log('Select term_hierarchy error - '+err); }
							
							currentTerm = sub_level[0].parent;
							if (currentTerm !== 0) {
								paths.push(sub_level[0].parent);
							}
							whilst_cb();

						});

					},
					function(err) {
						if (err) { console.log('Asyhc whilst error - '+err); }

						// Add the category ID as the top-most path.
						paths.push(td.vid);

						vocabulary_path_inserts(td.tid, paths.reverse(), function() {
							i++;
							socket.emit('progress', (100 / term_data.length) * i);
							cb();
						});

					}
				);

			});

		}, function(err) {
			callback();
		});

	});

}

/************************************************************
***
*** PRODUCT CATEGORIES MIGRATION
***
*************************************************************/

var product_to_category_inserts = function(productID, categoryIDs, categoriesCallback) {

	var i = 0;

	async.whilst(
		function() {
			return i < categoryIDs.length;
		},
		function(cb) {

			opencart_db.query('INSERT INTO oc_product_to_category SET ?',
				{
					product_id: productID,
					category_id: categoryIDs[i]
				},
			function(err) {
				if (err) { console.log('Product to category inserts error - '+err); }
				i++;
				cb();
			});

		},
		function(err) {
			categoriesCallback();
		}
	);

}

exports.product_categories = function(socket, callback) {

	console.log('migrate product categories');
	socket.emit('status', 'Migrating Product Categories');

	var i = 0;

	var term_select_sql = 'SELECT\
								term_node.nid AS nid,\
								term_hierarchy.tid AS tid,\
								term_hierarchy.parent AS parent,\
								term_data.vid AS main_category\
							FROM term_node LEFT JOIN term_data ON term_data.tid = term_node.tid LEFT JOIN term_hierarchy ON term_hierarchy.tid = term_node.tid';

	ubercart_db.query(term_select_sql, function(err, product_categories, fields) {

		var completed = {};

		async.eachSeries(product_categories, function(pc, cb) {

			var categories = [];
			
			var currentTerm = pc.parent;
			categories.push(pc.tid);

			if (!completed[pc.nid]) {
				completed[pc.nid] = [];
			}

			async.whilst(
				function() {

					return currentTerm !== 0;

				},
				function(whilst_cb) {

					ubercart_db.query('SELECT * FROM term_hierarchy WHERE tid = ?', currentTerm, function(err, sub_level, fields) {

						if (err) { console.log('Select term_hierarchy error - '+err); }
						
						currentTerm = sub_level[0].parent;
						if (currentTerm !== 0) {
							categories.push(sub_level[0].parent);
						}
						whilst_cb();

					});

				},
				function(err) {
					if (err) { console.log('Async whilst error - '+err); }

					if (completed[pc.nid].indexOf(pc.main_category) === -1) {
						completed[pc.nid].push(pc.main_category);
						categories.push(pc.main_category);
					}

					product_to_category_inserts(pc.nid, categories.reverse(), function() {
						i++;
						socket.emit('progress', (100 / product_categories.length) * i);
						cb();
					});

				}
			);

		}, function(err) {
			if (err) { console.log('Async product categories error - '+err); }

			callback();

		});

	});

}

/************************************************************
***
*** PRODUCT OPTIONS MIGRATION
***
*************************************************************/

exports.product_options = function(socket, callback) {

	console.log('migrate product options');
	socket.emit('status', 'Migrating Product Options');

	var i = 0;

	var product_options_sql = 'SELECT\
									uc_attribute_options.aid as attribute_id,\
									uc_attribute_options.name as attribute_name,\
									uc_product_options.oid as option_id,\
									uc_product_options.nid as product_id,\
									uc_product_options.price AS option_price,\
									uc_product_options.weight AS option_weight\
								FROM uc_product_options\
								LEFT JOIN uc_attribute_options ON uc_attribute_options.oid = uc_product_options.oid\
								WHERE uc_attribute_options.aid = ?\
								ORDER BY uc_product_options.nid ASC';

	ubercart_db.query('SELECT * FROM uc_attributes', function(err, attributes, fields) {

		if (err) { console.log('uc_product_options select error - '+err); }

		async.eachSeries(attributes, function(a, cb) {

			ubercart_db.query(product_options_sql, [a.aid], function(err, attribute_options, fields) {

				if (err) { console.log('product_options_sql select error - '+err); }

				// Don't try to insert duplicate entries into oc_product_option
				var productIDs = [];
				var productOptionID;

				async.eachSeries(attribute_options, function(ao, cb2) {

					async.series([
						function(series_cb) {

							if (productIDs.indexOf(ao.product_id) === -1) {
								// First link the overall attribute with the product
								opencart_db.query('INSERT INTO oc_product_option SET ?',
									{
										product_id: ao.product_id,
										option_id: ao.attribute_id,
										value: '',
										required: '1'
									},
								function(err, result) {

									if (err) { console.log('Insert into oc_product_option error - '+err); }
									productIDs.push(ao.product_id);
									productOptionID = result.insertId;
									series_cb();

								});
							} else {
								series_cb();
							}

						},

						function(series_cb) {

							if (productOptionID == '1234') {
								console.log(ao.product_id);
							}

							// Then, create a list of selected attribute options for that product
							opencart_db.query('INSERT INTO oc_product_option_value SET ?',
								{
									product_option_id: productOptionID,
									product_id: ao.product_id,
									option_id: ao.attribute_id,
									option_value_id: ao.option_id,
									quantity: '0',
									subtract: '0',
									price: ao.option_price,
									price_prefix: '+',
									points: '0',
									points_prefix: '+',
									weight: ao.option_weight,
									weight_prefix: '+'
								},
							function(err) {
								if (err) { console.log('Insert into oc_product_option_value error - '+err); }
								series_cb();
							});

						}
					], function(err) {
						if (err) { console.log('Async series product_options error - '+err); }
						cb2();
					});

				}, function(err) {

					if (err) { console.log('Async attribute options error - '+err); }
					i++;
					socket.emit('progress', (100 / attributes.length) * i);
					cb();

				});

			});

		}, function(err) {

			if (err) { console.log('Async product options error - '+err); }
			callback();

		});

	});

}

/************************************************************
***
*** PRODUCT IMAGES MIGRATION
***
*************************************************************/

var download = function(uri, filename, downloadCallback) {
	request.head(uri, function(err, res, body){
		request(uri).pipe(fs.createWriteStream(filename)).on('close', downloadCallback);
	});
};

exports.product_images = function(socket, callback) {

	console.log('migrate product images');
	socket.emit('status', 'Migrating Product Images');

	var product_images_sql = 'SELECT\
								node.nid as nid,\
								files.filepath as filepath\
							FROM content_field_image_cache\
								LEFT JOIN node ON node.nid = content_field_image_cache.nid\
								LEFT JOIN files ON files.fid = content_field_image_cache.field_image_cache_fid\
							WHERE content_field_image_cache.delta = 0\
							AND filepath != "null"';

	ubercart_db.query(product_images_sql, function(err, images, fields) {

		var total_images = images.length;
		var i = 0;

		if (err) { console.log('Select product images error - '+err); }

		async.eachSeries(images, function(image, cb) {

			var filename = (image.filepath).replace('sites/default/files/', '');
			var image_location = '/catalog/product/'+filename;

			opencart_db.query('UPDATE oc_product SET image = ? WHERE product_id = ?', [image_location, image.nid], function(err, result) {
				
				if (err) { console.log('Update oc_product with image error - '+err); }

				var image_url = (config.url_from+'/'+image.filepath).replace(' ', '%20');
				var image_dest = (config.url_to_dir+'/image'+image_location);

				// Download the image from the old website and save to opencart
				// We will also send a progress report when completed

				download(image_url, image_dest, function() {
						i++;
						socket.emit('progress', (100 / total_images) * i);
						cb();
				});

			});

		}, function(err) {
			if (err) { console.log('Async images error - '+err); }
			callback();

		});

	});

}

/************************************************************
***
*** ORDERS MIGRATION
***
*************************************************************/

exports.orders = function(socket, callback) {

	console.log('migrate orders');
	socket.emit('status', 'Migrating Orders');

	var i = 0;

	var orders_select_sql = 'SELECT * FROM uc_orders\
							LEFT JOIN uc_countries ON uc_orders.billing_country=uc_countries.country_id\
							LEFT JOIN uc_zones ON uc_orders.billing_zone=uc_zones.zone_id';

	ubercart_db.query(orders_select_sql, function(err, orders, fields) {

		if (err) { console.log('Orders select error - '+err); }

		async.eachSeries(orders, function(order, cb) {

			// Get the country code which opencart uses
			opencart_db.query('SELECT * FROM oc_country WHERE iso_code_2 = ?', [order.country_iso_code_2], function(err, country, fields) {

				if (err) { console.log('Orders oc_country select error - '+err); }

				var countryID = country[0].country_id;
				var countryName = country[0].name;

				// Next, get the zone
				opencart_db.query('SELECT * FROM oc_zone WHERE country_id = ? AND code = ?', [countryID, order.zone_code], function(err, zone, fields) {

					if (err) { console.log('Orders oc_zone select error - '+err); }

					if (zone[0]) {
						var zoneID = zone[0].zone_id;
						var zoneName = zone[0].name;
					} else {
						var zoneID = 0;
						var zoneName = 'N/A';
					}

					// Now insert the order into opencart
					var orderCreated = new Date(order.created*1000);
					var orderModified = new Date(order.modified*1000);

					if (order.order_status == 'processing') {
						var orderStatus = '2';
					} else if (order.order_status == 'canceled') {
						var orderStatus = '7';
					} else if (order.order_status == 'in_checkout') {
						var orderStatus = '2';
					} else if (order.order_status == 'pending') {
						var orderStatus = '1';
					} else if (order.order_status == 'completed') {
						var orderStatus = '5';
					} else if (order.order_status == 'payment_received') {
						var orderStatus = '5';
					} else if (order.order_status == 'dispatched') {
						var orderStatus = '3';
					} else if (order.order_status == 'pending_2') {
						var orderStatus = '1';
					}

					opencart_db.query('INSERT INTO oc_order SET ?',
						{
							order_id: order.order_id,
							invoice_no: '0',
							invoice_prefix: '',
							store_id: '0',
							store_name: config.opencart_store_name,
							store_url: config.url_to,
							customer_id: order.uid,
							customer_group_id: '0',
							firstname: order.delivery_first_name,
							lastname: order.delivery_last_name,
							email: order.primary_email,
							telephone: order.delivery_phone,
							fax: '',
							custom_field: '',
							payment_firstname: order.billing_first_name,
							payment_lastname: order.billing_last_name,
							payment_company: order.billing_company,
							payment_address_1: order.billing_street1,
							payment_address_2: order.billing_street2,
							payment_city: order.billing_city,
							payment_postcode: order.billing_postal_code,
							payment_country: countryName,
							payment_country_id: countryID,
							payment_zone: zoneName,
							payment_zone_id: zoneID,
							payment_address_format: '',
							payment_custom_field: '',
							payment_method: order.payment_method,
							payment_code: '',
							shipping_firstname: order.delivery_first_name,
							shipping_lastname: order.delivery_last_name,
							shipping_company: order.delivery_company,
							shipping_address_1: order.delivery_street1,
							shipping_address_2: order.delivery_street2,
							shipping_city: order.delivery_city,
							shipping_postcode: order.delivery_postal_code,
							shipping_country: countryName,
							shipping_country_id: countryID,
							shipping_zone: zoneName,
							shipping_zone_id: zoneID,
							shipping_address_format: '',
							shipping_custom_field: '',
							shipping_method: (countryID === '222' ? 'UK Standard Delivery' : 'European Delivery'),
							shipping_code: '',
							comment: '',
							total: order.order_total,
							order_status_id: orderStatus,
							affiliate_id: '0',
							commission: '0.0000',
							marketing_id: '0',
							tracking: '',
							language_id: '1',
							currency_id: '0',
							currency_code: config.currency,
							currency_value: '1.00000000',
							ip: order.host,
							forwarded_ip: order.host,
							user_agent: '',
							accept_language: '',
							date_added: orderCreated,
							date_modified: orderModified
						},
					function(err) {

						if (err) { console.log('Orders insert error - '+err); }
						
						// Next, find the products attached to this order
						ubercart_db.query('SELECT * FROM uc_order_products WHERE order_id = ?', [order.order_id], function(err, order_products, fields) {

							if (err) { console.log('Order products select error - '+err); }

							var orderSubtotal = 0;
							var orderTax = 0;
							var shipping = 0;

							async.eachSeries(order_products, function(op, cb2) {

								// Tax on one item
								var productTax = (op.price / 100) * 20;

								// Total price when multiplied by the quantity
								var totalPrice = (op.price * op.qty);

								// Tax on quantity of item
								var totalProductTax = (totalPrice / 100 ) * 20;

								// Add to the overall order values
								orderSubtotal += totalPrice;
								orderTax += totalProductTax;

								ubercart_db.query('SELECT * FROM uc_order_line_items WHERE order_id = ?', [order.order_id], function(err, order_line_items, fields) {

									if (err) { console.log('Order line items select error - '+err); }

									// Function to extract the Tax and Shipping amounts from the order_line_item row
									var getTaxShippingValues = function(data, taxShippingCallback) {

										var result = {};

										async.eachSeries(data, function(obj, cb) {

											if ( obj.type == 'tax' ) {
												result.tax = obj.amount;
											} else {
												result.shipping = obj.amount;
												shipping += obj.amount;
											}

											cb();

										}, function(err) {
											if (err) { console.log('Async get tax shipping error - '+err); }
											taxShippingCallback(result);
										});
									}
									
									getTaxShippingValues(order_line_items, function(taxShipping) {

										opencart_db.query('INSERT INTO oc_order_product SET ?',
											{
												'order_id': op.order_id,
												'product_id': op.order_product_id,
												'name': op.title,
												'model': op.model,
												'quantity': op.qty,
												'price': op.price.toFixed(4),
												'total': totalPrice.toFixed(4),
												'tax': productTax.toFixed(4),
												'reward': '0'
											},
										function(err, result) {

											if (err) { console.log('Order products insert error - '+err); }
											
											var orderProductID = result.insertId;

											var unserializedData = PHPUnserialize.unserialize(op.data);

											asyncEachObject(
												unserializedData.attributes,
												function iterator(value, key, nextEach) {

													// Get value of the object													
													for (k in value) {
														if (value.hasOwnProperty(k)) {
															
															opencart_db.query('INSERT INTO oc_order_option SET ?',
																{
																	order_id: op.order_id,
																	order_product_id: op.order_product_id,
																	product_option_id: '0',
																	product_option_value_id: '0',
																	name: key,
																	value: value[k],
																	type: ''
																},
															function(err) {
																if (err) { console.log('oc_order_option insert error - '+err); }
																nextEach();
															});

														}
													}
												},
												function complete(err) {
													if (err) { console.log('Serialized data attributes error - '+err); }
													cb2();
												}
											);

										});

									});

								});


							}, function(err) {

								if (err) { console.log('Order products async error - '+err); }

								var totals = ['subtotal', 'shipping', 'tax', 'total'];

								async.eachSeries(totals, function(type, cb3) {

									// Conditional insert values
									if (type == 'subtotal') {
										var code = 'sub_total';
										var title = 'Sub-Total';
										var value = orderSubtotal.toFixed(4);
										var sort_order = '1';
									} else if (type == 'shipping') {
										var code = 'shipping';
										var title = 'Shipping';
										var value = shipping.toFixed(4);
										var sort_order = '3';
									} else if (type == 'tax') {
										var code = 'tax';
										var title = 'VAT';
										var value = orderTax.toFixed(4);
										var sort_order = '5';
									} else if (type == 'total') {
										var code = 'total';
										var title = 'Total';
										var value = (orderSubtotal + shipping + orderTax).toFixed(4);
										var sort_order = '6';
									}

									opencart_db.query('INSERT INTO oc_order_total SET ?',
										{
											order_id: order.order_id,
											code: code,
											title: title,
											value: value,
											sort_order: sort_order
										},
									function(err) {
										if (err) { console.log('Insert '+type+' into oc_order_total error - '+err); }
										cb3();
									});

								}, function(err) {
									if (err) { console.log('Async oc_order_total error - '+err); }
									i++;
									socket.emit('progress', (100 / orders.length) * i);
									cb();
								});			

							});

						});

					});

				});

			});

		}, function(err) {
			if (err) { console.log('Orders async error - '+err); }
			callback();
		});

	});
}

/************************************************************
***
*** MIGRATE ORDER HISTORY
***
*************************************************************/

exports.order_history = function(socket, callback) {

	console.log('migrate order history');
	socket.emit('status', 'Migrating Order History');

	var i = 0;

	ubercart_db.query('SELECT * FROM uc_order_comments', function(err, order_comments, fields) {

		if (err) { console.log('uc_order_comments select error - '+err); }

		async.eachSeries(order_comments, function(oc, cb) {

			if (oc.order_status == 'processing') {
				var order_status = '2';
			} else if (oc.order_status == 'canceled') {
				var order_status = '7';
			} else if (oc.order_status == 'in_checkout') {
				var order_status = '2';
			} else if (oc.order_status == 'pending') {
				var order_status = '1';
			} else if (oc.order_status == 'completed') {
				var order_status = '5';
			} else if (oc.order_status == 'payment_received') {
				var order_status = '5';
			} else if (oc.order_status == 'dispatched') {
				var order_status = '3';
			} else if (oc.order_status == 'pending_2') {
				var order_status = '1';
			}

			var dateAdded = new Date(oc.created*1000);

			opencart_db.query('INSERT INTO oc_order_history SET ?', 
				{
					order_id: oc.order_id,
					order_status_id: order_status,
					notify: '1',
					comment: oc.message,
					date_added: dateAdded
				},
			function(err) {
				if (err) { console.log('Order history insert error - '+err); }
				i++;
				socket.emit('progress', (100 / order_comments.length) * i);
				cb();
			});

		}, function(err) {
			if (err) { console.log('Async order_comments error - '+err); }
			callback();
		});

	});

}

/************************************************************
***
*** SEO URLS
***
*************************************************************/

exports.seo_urls = function(socket, callback) {

	console.log('Creating SEO URLS for products');
	socket.emit('status', 'Creating SEO URLs for Products');

	var i = 0;

	var usedKeywords = [];

	var getKeyword = function(id, name, keywordCallback) {

		var safeKeyword = name.replace(/[\£\$\%\/\*\&\!\'\"\(\)\ ]+/g, '-').toLowerCase();

		if (usedKeywords.indexOf(safeKeyword) !== -1) {
			// Keyword has already been used, so we need to append a number to it

			for (i = 1; i < 100; i++) {
				var appendedKeyword = safeKeyword+'-'+i;
				if (usedKeywords.indexOf(appendedKeyword) === -1) {
					usedKeywords.push(appendedKeyword);
					keywordCallback(appendedKeyword);
					break;
				}
			}

		} else {
			usedKeywords.push(safeKeyword);
			keywordCallback(safeKeyword);
		}

	}

	// First, create SEO URL's for products
	var product_sql = 'SELECT\
							product_id AS id,\
							name\
						FROM oc_product_description\
						ORDER BY name ASC';

	opencart_db.query(product_sql, function(err, product_descriptions, fields) {

		if (err) { console.log('Select product descriptions error - '+err); }

		async.eachSeries(product_descriptions, function(pd, cb) {

			getKeyword(pd.id, pd.name, function(keyword) {

				opencart_db.query('INSERT INTO oc_url_alias SET ?',
					{
						query: 'product_id='+pd.id,
						keyword: keyword
					},
				function(err) {
					if (err) { console.log('oc_url_alias insert error - '+err); }
					i++;
					socket.emit('progress', (100 / product_descriptions.length) * i);
					cb();
				});
				
			});

		}, function(err) {
			if (err) { console.log('Async product descriptions error - '+err); }

			console.log('Creating SEO URLS for categories');
			socket.emit('status', 'Creating SEO URLs for Categories');

			i = 0;

			// Now do the same but for categories
			var category_sql = 'SELECT\
									category_id AS id,\
									name\
								FROM oc_category_description\
								ORDER BY name ASC';

			opencart_db.query(category_sql, function(err, category_descriptions, fields) {

				if (err) { console.log('Select category descriptions error - '+err); }

				async.eachSeries(category_descriptions, function(cd, cb) {

					getKeyword(cd.id, cd.name, function(keyword) {

						opencart_db.query('INSERT INTO oc_url_alias SET ?',
							{
								query: 'category_id='+cd.id,
								keyword: keyword
							},
						function(err) {
							if (err) { console.log('oc_url_alias insert error - '+err); }
							i++;
							socket.emit('progress', (100 / category_descriptions.length) * i);
							cb();
						});
						
					});

				}, function(err) {
					if (err) { console.log('Async product descriptions error - '+err); }
					callback();
				});

			});


		});

	});


}