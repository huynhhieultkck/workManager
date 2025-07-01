const express = require('express');
const controller = require('./controller');
const upload = require('./upload');
const router = express.Router();
const path = require('path');

router.get('/', controller.get);
router.post('/', controller.add);
router.put('/', controller.submit);
router.get('/count', controller.count);
router.get('/sign', controller.sign);
router.post('/results', controller.views);
router.get('/u', (req, res) => {
    res.sendFile(path.join(__dirname, '/upload.html'));
});
router.get('/:key', controller.view);
router.post('/upload', upload.upload.single('myFile'), upload.uploadSingleFile);
router.post('/upload-multiple', upload.upload.array('myFiles', 100), upload.uploadMultipleFiles);


module.exports = router;
