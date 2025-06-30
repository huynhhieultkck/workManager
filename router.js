const express = require('express');
const controller = require('./controller');
const upload = require('./upload');
const router = express.Router();

router.get('/', controller.get);
router.post('/', controller.add);
router.put('/', controller.submit);
router.get('/count', controller.count);
router.post('/views', controller.views);
router.get('/:key', controller.view);
router.post('/upload', upload.upload.single('myFile'), upload.uploadSingleFile);
router.post('/upload-multiple', upload.upload.array('myFiles', 100), upload.uploadMultipleFiles);


module.exports = router;
