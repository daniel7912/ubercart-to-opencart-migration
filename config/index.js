var config = {

	secretKey: 'secret key here',

	ubercart_database: {
		db_host: 'localhost',
		db_name: '',
		db_user: '',
		db_password: ''
	},

	opencart_database: {
		db_host: 'localhost',
		db_name: '',
		db_user: '',
		db_password: ''
	},

	currency: 'GBP',

	opencart_store_name: 'Your Store Name',

	truncate_databases: true,

	url_from: 'http://www.yourdomain.co.uk',
	url_to: 'http://www.yournewdomain.co.uk',
	url_to_dir: '/var/www/www.yournewdomain.co.uk'

};

module.exports = config;