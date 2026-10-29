/* eslint-disable no-console */
import PageManager from '../page-manager';
import stateCountry from './common/state-country';
import nod from './common/nod';
import validation from './common/form-validation';
import forms from './common/models/forms';
import {
    classifyForm,
    Validators,
    createPasswordValidationErrorTextObject,
    announceInputErrorMessage,
} from './common/utils/form-utils';
import { createTranslationDictionary } from './common/utils/translations-utils';

export default class Auth extends PageManager {
    constructor(context) {
        super(context);
        this.validationDictionary = createTranslationDictionary(context);
        this.formCreateSelector = 'form[data-create-account-form]';
        this.recaptcha = $('.g-recaptcha iframe[src]');
    }

    registerLoginValidation($loginForm) {
        const loginModel = forms;

        this.loginValidator = nod({
            submit: '.login-form input[type="submit"]',
            tap: announceInputErrorMessage,
        });

        this.loginValidator.add([
            {
                selector: '.login-form input[name="login_email"]',
                validate: (cb, val) => {
                    const result = loginModel.email(val);

                    cb(result);
                },
                errorMessage: this.context.useValidEmail,
            },
            {
                selector: '.login-form input[name="login_pass"]',
                validate: (cb, val) => {
                    const result = loginModel.password(val);

                    cb(result);
                },
                errorMessage: this.context.enterPass,
            },
        ]);

        $loginForm.on('submit', event => {
            this.loginValidator.performCheck();

            if (this.loginValidator.areAll('valid')) {
                return;
            }

            event.preventDefault();
        });
    }

    registerForgotPasswordValidation($forgotPasswordForm) {
        this.forgotPasswordValidator = nod({
            submit: '.forgot-password-form input[type="submit"]',
            tap: announceInputErrorMessage,
        });

        this.forgotPasswordValidator.add([
            {
                selector: '.forgot-password-form input[name="email"]',
                validate: (cb, val) => {
                    const result = forms.email(val);

                    cb(result);
                },
                errorMessage: this.context.useValidEmail,
            },
        ]);

        $forgotPasswordForm.on('submit', event => {
            this.forgotPasswordValidator.performCheck();

            if (this.forgotPasswordValidator.areAll('valid')) {
                return;
            }

            event.preventDefault();
        });
    }

    registerNewPasswordValidation() {
        const { password: enterPassword, password_match: matchPassword } = this.validationDictionary;
        const newPasswordForm = '.new-password-form';
        const newPasswordValidator = nod({
            submit: $(`${newPasswordForm} input[type="submit"]`),
            tap: announceInputErrorMessage,
        });
        const passwordSelector = $(`${newPasswordForm} input[name="password"]`);
        const password2Selector = $(`${newPasswordForm} input[name="password_confirm"]`);
        const errorTextMessages = createPasswordValidationErrorTextObject(enterPassword, enterPassword, matchPassword, this.passwordRequirements.error);
        Validators.setPasswordValidation(
            newPasswordValidator,
            passwordSelector,
            password2Selector,
            this.passwordRequirements,
            errorTextMessages,
        );
    }

    registerCreateAccountValidator($createAccountForm) {
        const validationModel = validation($createAccountForm, this.context);
        const createAccountValidator = nod({
            submit: `${this.formCreateSelector} input[type='submit']`,
            delay: 900,
        });
        const $stateElement = $('[data-field-type="State"]');
        const emailSelector = `${this.formCreateSelector} [data-field-type='EmailAddress']`;
        const $emailElement = $(emailSelector);
        const passwordSelector = `${this.formCreateSelector} [data-field-type='Password']`;
        const $passwordElement = $(passwordSelector);
        const password2Selector = `${this.formCreateSelector} [data-field-type='ConfirmPassword']`;
        const $password2Element = $(password2Selector);

        createAccountValidator.add(validationModel);

        if ($stateElement) {
            let $last;

            // Requests the states for a country with AJAX
            stateCountry($stateElement, this.context, (err, field) => {
                if (err) {
                    throw new Error(err);
                }

                const $field = $(field);

                if (createAccountValidator.getStatus($stateElement) !== 'undefined') {
                    createAccountValidator.remove($stateElement);
                }

                if ($last) {
                    createAccountValidator.remove($last);
                }

                if ($field.is('select')) {
                    $last = field;
                    Validators.setStateCountryValidation(createAccountValidator, field, this.validationDictionary.field_not_blank);
                } else {
                    Validators.cleanUpStateValidation(field);
                }
            });
        }

        if ($emailElement) {
            createAccountValidator.remove(emailSelector);
            Validators.setEmailValidation(createAccountValidator, emailSelector, this.validationDictionary.valid_email);
        }

        if ($passwordElement && $password2Element) {
            const { password: enterPassword, password_match: matchPassword } = this.validationDictionary;

            createAccountValidator.remove(passwordSelector);
            createAccountValidator.remove(password2Selector);
            Validators.setPasswordValidation(
                createAccountValidator,
                passwordSelector,
                password2Selector,
                this.passwordRequirements,
                createPasswordValidationErrorTextObject(enterPassword, enterPassword, matchPassword, this.passwordRequirements.error),
            );
        }

        $createAccountForm.on('submit', event => {
            this.submitAction(event, createAccountValidator);
        });
    }

    submitAction(event, validator) {
        validator.performCheck();
        if (validator.areAll('valid')) {
            return;
        }
        event.preventDefault();

        setTimeout(() => {
            const earliestError = $('span.form-inlineMessage:first').prev('input');
            earliestError.focus();
        }, 900);
    }

    /**
     * Request is made in this function to the remote endpoint and pulls back the states for country.
     */
    onReady() {
        if (!this.recaptcha.attr('title')) {
            this.recaptcha.attr('title', this.context.recaptchaTitle);
        }

        const $createAccountForm = classifyForm(this.formCreateSelector);
        const $loginForm = classifyForm('.login-form');
        const $forgotPasswordForm = classifyForm('.forgot-password-form');
        const $newPasswordForm = classifyForm('.new-password-form'); // reset password

        // Injected via auth.html
        this.passwordRequirements = this.context.passwordRequirements;

        if ($loginForm.length) {
            this.registerLoginValidation($loginForm);
        }

        if ($newPasswordForm.length) {
            this.registerNewPasswordValidation();
        }

        if ($forgotPasswordForm.length) {
            this.registerForgotPasswordValidation($forgotPasswordForm);
        }

        if ($createAccountForm.length) {
            this.registerCreateAccountValidator($createAccountForm);
        }

        // Initialize passwordless login functionality
        this.initializePasswordlessLogin();
    }

    /**
     * Initialize passwordless login functionality
     * Bind event for button to open passwordless login
     */
    initializePasswordlessLogin() {
        const $openButton = $('#supermarket__passwordless-open');

        if ($openButton.length) {
            $openButton.on('click', (e) => {
                e.preventDefault();
                this.openPasswordlessLogin();
            });
        }
    }

    /**
     * Open passwordless login mode
     * Hide password field and show passwordless login interface
     */
    openPasswordlessLogin() {
        const $loginForm = $('.login-form');

        // Add class to switch to passwordless mode
        $loginForm.addClass('supermarket__passwordless-mode');

        // Focus on email field
        $('#login_email').focus();

        // Bind events for passwordless submit
        this.bindPasswordlessEvents();
    }

    /**
     * Close passwordless login mode
     * Show password field again and hide passwordless login interface
     * @param {boolean} hideSuccessMessage - whether to hide success message
     */
    closePasswordlessLogin(hideSuccessMessage = true) {
        const $loginForm = $('.login-form');

        // Remove passwordless mode class
        $loginForm.removeClass('supermarket__passwordless-mode');

        // Hide success message if requested
        if (hideSuccessMessage) {
            $('.supermarket__passwordless-success').hide();
        }

        // Always hide error message when closing passwordless mode
        $('.supermarket__passwordless-error').hide();

        // Unbind passwordless events
        this.unbindPasswordlessEvents();
    }

    /**
     * Send passwordless login request to BigCommerce API
     * According to documentation: POST to /login.php?action=passwordless_login
     */
    async submitPasswordlessLogin() {
        const email = $('#login_email').val().trim();

        // Validate email
        if (!email) {
            this.showPasswordlessError(this.context.passwordlessEnterEmail);
            return;
        }

        if (!this.isValidEmail(email)) {
            this.showPasswordlessError(this.context.passwordlessInvalidEmail);
            return;
        }

        // Show loading state
        this.setPasswordlessLoading(true);

        try {
            // Send POST request to BigCommerce passwordless login endpoint
            const response = await fetch('/login.php?action=passwordless_login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    email,
                    // redirect_url not needed per requirements
                }),
            });

            if (response.status === 404) {
                // 404 Error - endpoint does not exist
                this.showPasswordlessError(this.context.passwordlessNotSupported);
                console.error('❌ Passwordless login endpoint not found (404)');
                return;
            }

            const data = await response.json();

            if (response.ok && data.sent_email === 'sign_in') {
                // Success - show success message
                this.showPasswordlessSuccess(data.expiry);
            } else {
                // Other server errors
                let errorMessage = this.context.passwordlessGeneralError;

                // Handle different types of errors
                if (response.status === 400) {
                    errorMessage = this.context.passwordlessInvalidEmail;
                } else if (response.status === 429) {
                    errorMessage = this.context.passwordlessTooManyRequests;
                } else if (response.status >= 500) {
                    errorMessage = this.context.passwordlessServerError;
                }

                this.showPasswordlessError(errorMessage);
                console.error('❌ Passwordless login failed:', {
                    status: response.status,
                    data,
                });
            }
        } catch (error) {
            // Network or JSON parsing errors
            let errorMessage = this.context.passwordlessNetworkError;

            // Check specific error types
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = this.context.passwordlessNetworkError;
            } else if (error.name === 'SyntaxError') {
                errorMessage = this.context.passwordlessServerError;
            } else {
                errorMessage = this.context.passwordlessGeneralError;
            }

            this.showPasswordlessError(errorMessage);
            console.error('❌ Passwordless login error:', error);
        } finally {
            // Turn off loading state
            this.setPasswordlessLoading(false);
        }
    }

    /**
     * Bind events for passwordless login
     */
    bindPasswordlessEvents() {
        const $sendButton = $('#supermarket__passwordless-send');
        const $cancelButton = $('#supermarket__passwordless-cancel');

        // Bind click events
        $sendButton.off('click.passwordless').on('click.passwordless', (e) => {
            e.preventDefault();
            this.submitPasswordlessLogin();
        });

        $cancelButton.off('click.passwordless').on('click.passwordless', (e) => {
            e.preventDefault();
            this.closePasswordlessLogin();
        });

        // Bind Enter key on email field in passwordless mode
        $('#login_email').off('keypress.passwordless').on('keypress.passwordless', (e) => {
            if (e.which === 13 && $('.login-form').hasClass('supermarket__passwordless-mode')) {
                e.preventDefault();
                this.submitPasswordlessLogin();
            }
        });
    }

    /**
     * Unbind passwordless events
     */
    unbindPasswordlessEvents() {
        $('#supermarket__passwordless-send').off('click.passwordless');
        $('#supermarket__passwordless-cancel').off('click.passwordless');
        $('#login_email').off('keypress.passwordless');
    }

    /**
     * Display success message with expiry time
     */
    showPasswordlessSuccess(expirySeconds) {
        const $successDiv = $('.supermarket__passwordless-success');
        const $expiryNote = $('.supermarket__passwordless-expiry-note');

        // Default to 15 minutes if expirySeconds is undefined or invalid
        const validExpirySeconds = (typeof expirySeconds === 'number' && !Number.isNaN(expirySeconds)) ? expirySeconds : 900;
        const minutes = Math.floor(validExpirySeconds / 60);

        // Log warning if expiry data is invalid
        if (typeof expirySeconds !== 'number' || Number.isNaN(expirySeconds)) {
            console.error('⚠️ Invalid expiry seconds received:', expirySeconds, 'Using default 15 minutes');
        }

        // Update expiry note with error handling
        if (this.context.passwordlessSuccessExpiry && this.context.passwordlessSuccessExpiry.includes('{expiry}')) {
            const expiryText = this.context.passwordlessSuccessExpiry.replace('{expiry}', minutes);
            $expiryNote.text(expiryText);
        } else {
            // Fallback empty text if template is missing
            $expiryNote.text('');
        }

        // Return to standard login form WITHOUT hiding success message
        this.closePasswordlessLogin(false);

        // Show success message (after closing passwordless mode)
        $successDiv.show();

        // Scroll to success message
        $('html, body').animate({
            scrollTop: $successDiv.offset().top - 20,
        }, 300);
    }

    /**
     * Display error message with alert component
     */
    showPasswordlessError(message) {
        console.error('🚫 Passwordless login error:', message);

        const $errorDiv = $('.supermarket__passwordless-error');
        const $errorMessage = $('.supermarket__passwordless-error-message');

        // Hide success message if currently displayed
        $('.supermarket__passwordless-success').hide();

        // Update error message content
        $errorMessage.text(message);

        // Show error message
        $errorDiv.show();

        // Scroll to error message
        $('html, body').animate({
            scrollTop: $errorDiv.offset().top - 20,
        }, 300);

        // Auto-hide error message after 8 seconds
        setTimeout(() => {
            $errorDiv.fadeOut();
        }, 8000);
    }

    /**
     * Set loading state for passwordless buttons
     */
    setPasswordlessLoading(isLoading) {
        const $form = $('.login-form');
        const $sendButton = $('#supermarket__passwordless-send');

        if (isLoading) {
            $form.addClass('supermarket__passwordless-loading');
            $sendButton.text(this.context.passwordlessSending);
        } else {
            $form.removeClass('supermarket__passwordless-loading');
            $sendButton.text(this.context.passwordlessSendLink);
        }
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
