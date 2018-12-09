const express = require('express');
var mongoose = require("mongoose");
var isbnSearch = require("node-isbn");
const bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');
var AWS = require('aws-sdk');
var fs =  require('fs');
const multer = require("multer");

const app = express();

app.use(express.static("public"));

app.use(bodyParser.urlencoded({ extended: true }));
// app.use(multer().array);

app.use(fileUpload());

app.set("view engine", "ejs");

var date1 = new Date();

//config
AWS.config.update({
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey,
    region: "us-east-2"
});

var s3 = new AWS.S3();

var myBucket = "onlinereading-bucket";

//Connect to database
mongoose.connect("mongodb://kody:3.14159265359@ds117830.mlab.com:17830/onlinereading", {
    useNewUrlParser: true
});

var bookSchema = new mongoose.Schema({
    isbn: String,
    title: String,
    author: String,
    description: String,
    rating: String,
    pageCount: String,
    date: String,
    publisher: String,
    imageName: String,
    fileName: String,
    fiction: String,
    genre: Array
 });
 
var Books = mongoose.model("Books", bookSchema);

app.get("/books", function(req, res){

    Books.find({}, function(err, allbooks) {
        if (err) {
            console.log("Problem getting books");
        }
        else {
        // var coverURLS = [];
        //     for(var i = 0; i < allbooks.length;i++){
        //         var coverURL = s3.getSignedUrl("getObject", {
        //             Bucket: "onlinereading-bucket",
        //             Key: allbooks[i].isbn + ".jpg",
        //         });
        //         coverURLS.push(coverURL);
        //     }
            // console.log(coverURLS);
            res.render("books", {
                allbooks: allbooks
            });
        }
    });
});

app.get("/books/onepage", function(req, res){
    Books.find({}, function(err, allbooks) {
        if (err) {
            console.log("Problem getting books");
        }
        else {
            res.render("onepage", {
                allbooks: allbooks
            });
        }
    });
});

//Take ISBN and post it
app.get("/books/add", function(req, res) {
    res.render("add");
});

//Take ISBN and search database for info on the book
app.post("/books/add", function(req, res){
    const isbn = req.body.isbn;
    isbnSearch.resolve(isbn, function (err, book) {
        if (err) {
            console.log('Book not found', err);
        } else {
            console.log('Book found %j', book);
            res.render("add", {
                book: book,
                isbn: isbn
            })
        }
    });
});

//Finally, take data sent from form and then create an entry in the database
app.post("/books/add/complete", function(req, res){
    const bookX = req.body;

    //A check
    if (!req.files)
    return res.status(400).send('No files were uploaded.');

    //Getting instances of the files uploaded
    const epubFile = req.files.bookFile;
    const coverFile = req.files.coverFile;
    //Setting the file names to its isbn
    const imageName = bookX.isbn + ".jpg";
    const fileName = bookX.isbn + ".epub";

    //Move Files into Local Storage
    // coverFile.mv('public/uploads/covers/' + imageName, function(err) {
    //     if (err)
    //         return res.status(500).send(err);
    // });
    // epubFile.mv('public/uploads/books/' + fileName, function(err) {
    //     if (err)
    //         return res.status(500).send(err);
    // });
    

    //Firebase upload
    s3.putObject({
        Bucket: myBucket,
        Key: imageName,
        Body: coverFile.data,
        ACL: "public-read"
    }, function(err, data){
        if(err){
            console.log(err)
        }else{
            console.log("Successfully uploaded image to AWS");
            console.log(data);
        }
    });

    s3.putObject({
        Bucket: myBucket,
        Key: fileName,
        Body: epubFile.data,
        ACL: "public-read"
    }, function(err, data){
        if(err){
            console.log(err)
        }else{
            console.log("Successfully uploaded EPUB file to AWS")
            console.log(data);
        }
    });

    isbnSearch.resolve(bookX.isbn, function (err, book) {
        if (err) {
            console.log('Book not found', err);
        } else {
            console.log("Book found");

            Books.create({
                isbn: bookX.isbn,
                title: bookX.title,
                author: bookX.author,
                description: bookX.description,
                rating: book.averageRating,
                pageCount: book.pageCount,
                date: book.publishedDate,
                publisher: book.publisher,
                imageName: imageName,
                fileName: fileName,
                fiction: bookX.fiction,
                genre: bookX.genre
            }, function(err, book) {
                if (err) {
                    console.log("Upload Failed!!!.");
                    console.log(err);
                } else {
                    console.log("Book " + bookX.title + " added to site.");
                    res.redirect("/books");
                }
            });

        }
    });
});

//Send user to page so they can read a book directly
app.get("/books/read/:id", function(req, res) {
    Books.findById(req.params.id, function(err, book) {
        if (err) {
            console.log("Unable to find book with given id: " + req.params.id);
        }
        else {

            // AWS.config.update({
            //     accessKeyId: "AKIAJCFG24PDUSK7WJHA",
            //     secretAccessKey: "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",
            //     region: "us-east-2"
            // })

            // var fileURL = s3.getSignedUrl("getObject", {
            //     Bucket: "onlinereading-bucket",
            //     Key: book.isbn + ".epub"
            // });

            var url = "https://s3.us-east-2.amazonaws.com/onlinereading-bucket/" + book.fileName;
            res.render("reader", {
                epub: url
            });
        }
    });
});


//Basic Routes
app.get("/", function(req, res){

    //Find the latest added books
    Books.find({}, function(err, book){
        if(err){
            console.log("Problem getting the most recent books.");
        }else{
            res.render("index", {
                book: book
            });
        }
    }).sort({date:-1}).limit(3);    
});
 
app.listen(process.env.PORT || 3000, () => console.log('Online Reading Website Started'));