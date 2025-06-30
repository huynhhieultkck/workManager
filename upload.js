const multer = require('multer');
const path = require('path');
const async = require('async');
const { db } = require('./controller');
const { Xfile, Xcode } = require('xsupport');

const _randomKey = () => `${Xcode.uuid.v4().split('-')[0]}${Date.now()}`;

const listAddWork = new async.queue(async (path) => {
    let list = Xfile.readAllLine(path).filter(v => /[^@+]@[^:]+:\S+/.test(v))
        .map(v => ({ type: 'Checker', data: { email: v.split(':')[0], pass: v.substring(v.indexOf(':') + 1) } }))
        .map(value => ({ key: _randomKey(), value }));
    await db.putMany('A', list);
    Xfile.delFile(path);
}, 1);

// Cấu hình multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'Data/'; // Thay đổi thành 'Data/'
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        const filename = file.fieldname + '-' + uniqueSuffix + fileExtension;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

const uploadSingleFile = (req, res) => {
    if (!req.file) {
        return res.status(400).send('Không có file nào được tải lên.');
    }

    const fileInfo = {
        originalname: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
    };

    // Cập nhật đường dẫn file trong fileInfo để trả về chính xác (tùy chọn)
    fileInfo.path = 'Data/' + fileInfo.filename;
    listAddWork.push(fileInfo.path);
    res.json({ message: 'File đã được tải lên thành công!', fileInfo });
};

const uploadMultipleFiles = (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('Không có file nào được tải lên.');
    }

    const fileInfos = req.files.map(file => {
        const filename = file.filename;
        return {
            originalname: file.originalname,
            filename: filename,
            mimetype: file.mimetype,
            size: file.size,
            path: 'Data/' + filename, // Cập nhật đường dẫn file
        };
    });
    listAddWork.push(fileInfos.map(v => v.path));
    res.json({ message: 'Các file đã được tải lên thành công!', fileInfos });
};


module.exports = {
    upload,
    uploadSingleFile,
    uploadMultipleFiles
};