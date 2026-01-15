// Load environment variables
require("dotenv").config();
const express = require("express");

// For form validation
const { check, validationResult } = require("express-validator");

// For sending emails
const SibApiV3Sdk = require("sib-api-v3-sdk");
const client = new SibApiV3Sdk.TransactionalEmailsApi();

const axios = require("axios");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Express app
const app = express();

// Register view engine
app.set("view engine", "ejs");

// Serve static files (for CSS/JS)
app.use(express.static("public"));

app.use(express.urlencoded({ extended: true }));

// Listen for requests
app.listen(3000);

// An array of middleware functions
const validateForm = [
  check("first_name")
    .trim()
    .escape() // Trim whitespace & escape HTML
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 3 })
    .withMessage("First name must be at least 3 characters long"),

  check("last_name")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2 })
    .withMessage("Last name must be at least 2 characters long"),

  check("email")
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Email is not valid"),

  check("message")
    .trim()
    .escape()
    .notEmpty()
    .withMessage("Message is required"),
];

// Respond to requests
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.get("/contact-us", (req, res) => {
  res.render("contact", {
    title: "Contact Us",
    errors: {}, // Ensure errors exist
    formData: {}, // Ensure formData exists
    successMessage: null,
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
  });
});

app.post("/contact-us", validateForm, async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  const formErrors = errors.isEmpty() ? {} : errors.mapped();

  // ✅ Verify reCAPTCHA v3
  const recaptchaToken = req.body.recaptcha_token;

  if (!recaptchaToken) {
    formErrors.recaptcha = { msg: "reCAPTCHA verification failed" };
  } else {
    try {
      const verificationURL = "https://www.google.com/recaptcha/api/siteverify";

      const response = await axios.post(verificationURL, null, {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken,
        },
      });

      const { success, score } = response.data;

      console.log("reCAPTCHA score:", score);

      if (!success || score < 0.5) {
        formErrors.recaptcha = {
          msg: "Suspicious activity detected. Please try again.",
        };
      }
    } catch (error) {
      console.error("reCAPTCHA verification error:", error);
      formErrors.recaptcha = { msg: "reCAPTCHA verification failed" };
    }
  }

  // If there are any errors, return early
  if (Object.keys(formErrors).length > 0) {
    return res.status(400).render("contact", {
      title: "Contact Us",
      errors: formErrors,
      formData: req.body,
      successMessage: null,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  }

  const {
    first_name,
    last_name,
    email,
    phone,
    newsletter,
    service,
    referral,
    message,
  } = req.body;

  // Convert service checkboxes to a readable string
  const selectedServices = Array.isArray(service)
    ? service.join(", ")
    : service || "None";
  const userReferral = referral || "Not specified";

  // ✅ Step 1: Send Email using Brevo
  try {
    await client.sendTransacEmail({
      sender: { email: process.env.MAIL_USERNAME, name: "Nu'an Colour" },
      to: [{ email: process.env.MAIL_USERNAME, name: "Nu'an Colour" }],
      subject: `You have a new message from ${first_name} ${last_name}`,
      htmlContent: `
        <h2>New Contact Form Submission</h2>
        <p><strong>First Name:</strong> ${first_name}</p>
        <p><strong>Last Name:</strong> ${last_name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Newsletter Subscription:</strong> ${
          newsletter ? "Yes" : "No"
        }</p>
        <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
        <p><strong>Services Interested In:</strong> ${selectedServices}</p>
        <p><strong>How They Found Us:</strong> ${userReferral}</p>
        <p><strong>Message:</strong><br>${message}</p>
      `,
    });
  } catch (error) {
    console.error("Brevo email error:", error);
    return res.status(500).render("contact", {
      title: "Contact Us",
      successMessage: null,
      errors: { email: { msg: "Failed to send email. Try again later." } },
      formData: req.body,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    });
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
            LNAME: last_name,
          },
        },
      ],
    };

    const options = {
      method: "POST",
      headers: {
        Authorization: `apikey ${process.env.MAILCHIMP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(addData),
    };

    try {
      const mailchimpResponse = await fetch(
        `https://us6.api.mailchimp.com/3.0/lists/${process.env.MAILCHIMP_LIST_ID}`,
        options
      );
      const mailchimpData = await mailchimpResponse.json();

      if (!mailchimpResponse.ok) {
        console.error("Mailchimp Error:", mailchimpData);
      }
    } catch (error) {
      console.error("Mailchimp Request Failed:", error);
    }
  }

  // ✅ Step 3: Send success response

  res.status(200).render("contact", {
    title: "Contact Us",
    successMessage: "Form submitted successfully!",
    errors: {},
    formData: {}, // Clear form after success
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
  });
});

app.use((req, res) => {
  res.status(404).render("404", { title: "404" });
});
