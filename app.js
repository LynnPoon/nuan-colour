require('dotenv').config(); // Load environment variables
const express = require('express');
const { check, validationResult } = require('express-validator'); // For form validation
const nodemailer = require('nodemailer'); // For sending emails


// express app
const app = express();

// register view engine
app.set('view engine', 'ejs');

// Serve static files (for CSS/JS)
app.use(express.static('public'));

app.use(express.urlencoded({ extended: true }));

// listen for requests
app.listen(3000);

// an array of middleware functions
const validateForm = [
  check('first_name')
    .trim().escape() // Trim whitespace & escape HTML
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),

  check('last_name')
    .trim().escape()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters long'),

  check('email')
    .trim().normalizeEmail() 
    .isEmail().withMessage('Email is not valid'),

  check('message')
    .trim().escape()
    .notEmpty().withMessage('Message is required')
];

// respond to requests
app.get('/', (req, res) => {
    res.render('index', {title: 'Home'});
});


app.get('/contact-us', (req, res) => {
  //res.render('contact', {title: 'Contact Us'});
  res.render('contact', {
    title: 'Contact Us',
    errors: {}, // Ensure errors exist
    formData: {}, // Ensure formData exists
    successMessage: null
  });
});


app.post('/contact-us', validateForm, async (req, res) => {

  // Check for validation errors
  const errors = validationResult(req);


  if (!errors.isEmpty()) {
    return res.status(400).render('contact', {
      title: 'Contact Us',
      errors: errors.mapped(), // Convert errors into an object for easy access
      formData: req.body, // Pass back the user's input
      successMessage: null
    });
  }

  const { first_name, last_name, email, phone, newsletter, service, referral, message,  } = req.body;

  // ✅ Step 1: Send Email using Nodemailer
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {        
        user: process.env.MAIL_USERNAME, 
        pass: process.env.MAIL_PASSWORD,   
    }
});


 // Convert service checkboxes to a readable string
 const selectedServices = Array.isArray(service) ? service.join(', ') : service || 'None';
 const userReferral = referral || 'Not specified';

const mailOptions = {
    from: process.env.MAIL_USERNAME, 
    to: process.env.MAIL_USERNAME,
    subject: `You have a new message from ${first_name} ${last_name}`,
    text: `You have received a new contact form submission:\n
    First Name: ${first_name}\n
    Last Name: ${last_name}\n
    Email: ${email}\n
    Newsletter Subscription: ${newsletter ? 'Yes' : 'No'}\n
    Phone: ${phone || 'Not provided'}\n
    Services Interested In: ${selectedServices}\n
    How They Found Us: ${userReferral}\n
    Message: ${message}`
};

try {
  console.log("Attempting to send email...");
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully!");
} catch (error) {
    console.error("Error sending email:", error);
    return res.status(500).json({ error: "Failed to send email" });
}

// ✅ Step 2: Subscribe User to Mailchimp (if checked)
if (newsletter) {  

    const addData = {
        members: [
            {
                email_address: email,
                status: "subscribed",
                merge_fields: {
                    FNAME: first_name,
                    LNAME: last_name
                }
            }
        ]
    };    

    const options = {
        method: "POST",
        headers: {
            "Authorization": `apikey ${process.env.MAILCHIMP_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(addData)
    };

    try {
        const mailchimpResponse = await fetch(`https://us6.api.mailchimp.com/3.0/lists/${process.env.MAILCHIMP_LIST_ID}`, options);
        const mailchimpData = await mailchimpResponse.json();

        if (!mailchimpResponse.ok) {
            console.error("Mailchimp Error:", mailchimpData);
        }
    } catch (error) {
        console.error("Mailchimp Request Failed:", error);
    }    
}

// ✅ Step 3: Send success response

res.status(200).render('contact', {
  title: 'Contact Us',
  successMessage: "Form submitted successfully!",
  errors: {},
  formData: {} // Clear form after success
});

});



app.use((req, res) => {
  res.status(404).render('404', {title: '404'});
});