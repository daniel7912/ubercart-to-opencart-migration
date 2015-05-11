var socket = io.connect('http://yourdomain.co.uk:3020');

socket.on('status', function(data) {
	$('#status').html('<h3>'+data+'</h3>');
	updateProgress(0);
});

socket.on('progress', function(percent) {
	updateProgress(percent.toFixed(2));
});

$('#start').on('click', function(e) {
	socket.emit('start');
});

var updateProgress = function(progress) {
	$('#progress').html('Progress - '+progress+'%');
};