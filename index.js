const express = require('express');
const router = require('./router');

const app = express();
app.use('/', router);

app.use((e, req, res, next) => {
    res.status(500).json({ success: false, message: e.message || 'Unknown !' });
})

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server chạy trên http://localhost:${port}`);
});
