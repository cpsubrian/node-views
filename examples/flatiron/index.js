var flatiron = require('flatiron'),
    app = flatiron.app,
    views = require('../../');

app.use(flatiron.plugins.http);
app.use(views.flatiron(__dirname + '/views'));

app.router.get('/', function () {
  this.render('index', {title: 'My Flatiron Example', name: 'Brian'});
});

app.start(3000, function() {
  console.log('Listening on http:/localhost:3000');
});