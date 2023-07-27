var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('roll5', { title: 'Klink' });
});

module.exports = router;
