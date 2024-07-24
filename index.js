import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "book",
    password: "gujunyan123",
    post: 5432,
  });
  
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static("public"));

// database
// coverId is isbn and it's used to call image url
// let books = [{ id: 1, bookTitle: "Queen of shadows", authorName: "Sarah J. Maas", cover_id: 1619636042, ratingValue: 3.9 }]
// let notes = [{id: 1, review: "this is a book review", review_date:"2024.5.24", book_id: id}]

// get cover_id to call image
app.get("/", async (req, res) => { 
    try {
        // const result = await db.query("SELECT title, author, cover_id, review, review_date FROM books JOIN reviews ON books.id = reviews.book_id");
        const booksResult = await db.query("SELECT * FROM books")
        const booksArr = booksResult.rows;
        // console.log(reviewsArr);
        res.render("index.ejs", {books: booksArr})
    } catch (err) {
        console.log(err);
   }
});


// add books 
app.post("/add", async (req, res) => {
    const bookTitle = req.body.title;
    console.log(bookTitle);

    // if the book is already in the db then pop up a window to tell the users
    const bookTitleResult = await db.query("SELECT title FROM books");
    const titleArr = bookTitleResult.rows;
    const filteredArr = titleArr.filter(obj => obj.title.toLowerCase() == bookTitle.toLowerCase());
    console.log(filteredArr);
    if (filteredArr.length === 1) {
        res.render("index.ejs", { bookTitleArr: filteredArr });
    } else {
        // replace all space between words with '+'
        const searchTitle = bookTitle.replaceAll(' ', '+');
        console.log(searchTitle);
        
        // get book API
        try {
        const response = await axios.get(`https://openlibrary.org/search.json?title=${searchTitle}&limit=10`);
        const title = response.data.docs[0].title;
        const author = response.data.docs[0].author_name[0];
        console.log(author);
        const cover_id = response.data.docs[0].cover_edition_key;
        const rating_value = response.data.docs[0].ratings_average;
        try {
            await db.query("INSERT INTO books(title, author, cover_id, rating_value) VALUES($1, $2, $3, $4)", [title, author, cover_id, rating_value]);
            res.redirect("/");
        } catch (error) {
            console.log("Insert into books db failed" + error);
        }
    } catch (error) {
        console.log("Getting book response failed" + error);
    }
    }
    
})

// get a review page
app.get("/reviews", async (req, res) => {
    const id = req.query.bookId;

    if (!id) {
        return res.status(400).send("bookId is undefined");
    } 
    const bookInfoResult = await db.query("SELECT id, title, cover_id FROM books WHERE id = $1", [id]);
    console.log(bookInfoResult.rows)
    const title = bookInfoResult.rows[0].title;
    const coverId = bookInfoResult.rows[0].cover_id;

    // every book only has one review that can be edited and deleted
    // if review has been added for current book id, show the review
    try {
        const reviewResult = await db.query("SELECT review FROM reviews WHERE book_id = $1", [id]);
        console.log(reviewResult.rows);

        // if the book doesn't have any reviews yet
        // we render review.ejs with form
        if (reviewResult.rows.length === 0) {
            console.log('There is no review yet');
            res.render("review.ejs", {title, coverId, id});
        } else {
            const review = reviewResult.rows[0].review;
            const date = new Date();
            console.log("This review is already in the datebase")
            res.render("review.ejs", { title, coverId, id, review, date });
        }
    } catch (error) {
        console.log(`We run into an error: ${error}`);
    }
})

// this endpoint will help us add review to db when there's no reviews for the current book
// then render reviews.ejs page 
app.post("/create-reviews", async (req, res) => {
    const review = req.body.review;
    const id = req.body.bookId; 
    // if review is empty, render "review.ejs" with current book's info
    if (review === '') {
        const currentBookInfoResult = await db.query("SELECT id, title, cover_id FROM books WHERE id = $1", [id]);
        const title = currentBookInfoResult.rows[0].title;
        const coverId = currentBookInfoResult.rows[0].cover_id;
        res.render("review.ejs", { title, coverId, id });
        // otherwise a review date will be generated
        // insert book's review and date in reviews db
    } else {
        try {
        const date = new Date();
        console.log(`${review} is added on ${date}, it belongs to book ${id}`);
        await db.query("INSERT INTO reviews(review, review_date, book_id) VALUES($1, $2, $3)", [review, date, id]);
        
        // try to get book info again for a different page with edit/delete button in review.ejs
        try {
            const bookInfoResult = await db.query("SELECT id, title, cover_id FROM books WHERE id = $1", [id]);
            const title = bookInfoResult.rows[0].title;
            const coverId = bookInfoResult.rows[0].cover_id;
            res.render("review.ejs", { title, coverId, review, id, date });
        } catch (error) {
            console.log("bookInfo is failed to get");
        }
    } catch (error) {
        console.log("An error has occured, Insert failed");
    }
    }
})

// edit button takes to edit page
app.get("/edit", async (req, res) => {
    try {
        const id = req.query.bookId;
        console.log(id);

        if (!id) {
            return res.status(400).send("bookId is undefined");
        }

        console.log(id);
        const bookInfoResult = await db.query("SELECT books.id, title, author, cover_id, review, review_date FROM books JOIN reviews ON books.id = reviews.book_id WHERE books.id = $1", [id]);
        console.log(bookInfoResult.rows);
        const title = bookInfoResult.rows[0].title;
        const coverId = bookInfoResult.rows[0].cover_id;
        const review = bookInfoResult.rows[0].review;
        res.render("edit.ejs", { title, coverId, review, id });
    } catch (error) { 
        console.log("An error has occured " + error );
    }
})

// update the book review, should us back to review page
app.post("/update-reviews", async (req, res) => {
    const updatedReview = req.body.updatedReview;
    const id = req.body.bookId;
    console.log("this is an update");
    try {  
        await db.query("UPDATE reviews SET review = $1 WHERE book_id = $2", [updatedReview, id]);
        try {
            const date = new Date();
            const updatedBookInfo = await db.query("SELECT books.id, title, author, cover_id, review, review_date FROM books JOIN reviews ON books.id = reviews.book_id WHERE books.id = $1", [id]);
            console.log(updatedBookInfo.rows);
            const title = updatedBookInfo.rows[0].title;
            const coverId = updatedBookInfo.rows[0].cover_id;
            const review = updatedBookInfo.rows[0].review;
            res.render("review.ejs", { title, coverId, review, id, date });
        } catch (error) {
            console.log("Fetch updeted book info failed" + error);
        }
    } catch (error) {
        console.log("Update book review failed" + error);
    }
    
})

// delete book review
app.get("/delete/:id", async (req, res) => {
    const id = req.params.id;
    
    try {
        await db.query("DELETE FROM reviews WHERE book_id = $1", [id]);

        try {
            const bookInfoResult = await db.query("SELECT id, title, cover_id FROM books WHERE id = $1", [id]);
            const title = bookInfoResult.rows[0].title;
            const coverId = bookInfoResult.rows[0].cover_id;
            res.render("review.ejs", { title, coverId, id });
        } catch (error) {
            console.log("Getting book information failed" + error); 
        }
    } catch (error) {
        console.log("Deletion failed" + error);
    }
    
})

// route for filter feature
app.get("/filter", async (req, res) => {
    const filter0ption = req.query['book-filter'];
    console.log(filter0ption);
    
    if (filter0ption === 'alphabat') {
        console.log("User chose to filer books from the A-Z");
        // if user choose to filer books from A-Z then make book titles in ASC order
        try {
            const filteredBooksResult = await db.query("SELECT * FROM books ORDER BY title ASC");
            res.render("index.ejs", { books: filteredBooksResult.rows });
        } catch (error) {
            console.log("Filtering failed" + error);
        }
    } else if (filter0ption === 'top-rated') {
        const filteredBooksResult = await db.query("SELECT * FROM books ORDER BY rating_value DESC");
        res.render("index.ejs", { books: filteredBooksResult.rows });
        console.log("User chose to filer books from the most popular books to the least");
    } else {
        const filteredBooksResult = await db.query("SELECT id, title, author, cover_id, rating_value FROM books WHERE books.id NOT IN (SELECT reviews.book_id FROM reviews)");
        console.log(filteredBooksResult.rows);
        res.render("index.ejs", { books: filteredBooksResult.rows });
        console.log("User chose to filer books that have no reviews");
    }
})

app.listen(port, () => {
    console.log(`The server is running on port ${port}.`);
});