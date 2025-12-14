/**
 * Landing Page JavaScript
 * Handles animations, scroll effects, and language switching
 */

(function () {
  'use strict';

  // ============================================
  // Navigation scroll effect
  // ============================================

  const navbar = document.getElementById('navbar');
  let lastScrollY = 0;

  function handleScroll() {
    const scrollY = window.scrollY;

    if (scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    lastScrollY = scrollY;
  }

  window.addEventListener('scroll', handleScroll, { passive: true });

  // ============================================
  // Fade-in animations on scroll
  // ============================================

  const fadeElements = document.querySelectorAll('.fade-in');

  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach((el) => {
    fadeObserver.observe(el);
  });

  // ============================================
  // Update language label and links
  // ============================================

  function updateLanguageUI() {
    const lang = getLang();
    const langLabel = document.getElementById('langLabel');
    const loginBtn = document.getElementById('loginBtn');

    if (langLabel) {
      langLabel.textContent = lang === 'ru' ? 'EN' : 'RU';
    }

    // Update login button href based on language
    if (loginBtn) {
      loginBtn.href = getLoginUrl();
    }

    // Update all links that point to /login
    document.querySelectorAll('a[href="/login"]').forEach((link) => {
      link.href = getLoginUrl();
    });

    // Update HTML lang attribute
    document.documentElement.lang = lang === 'en' ? 'en' : 'ru';

    // Update page title
    if (lang === 'en') {
      document.title = 'LinkBuilder Pro - Manage links systematically';
    } else {
      document.title = 'LinkBuilder Pro - Управляйте ссылками системно';
    }
  }

  // ============================================
  // Smooth scroll for anchor links
  // ============================================

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // ============================================
  // Initialize
  // ============================================

  // Apply translations and update UI
  if (typeof applyTranslations === 'function') {
    applyTranslations();
  }
  updateLanguageUI();

  // Initial scroll check
  handleScroll();

  // Initialize Lucide icons if available
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
})();
