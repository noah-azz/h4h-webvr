const express = require('express');

const app = express();

app.use(express.static('site'));

app.listen(5173, () => {
    console.log("Listening on port 5173");
})
