import { mount } from 'svelte'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css'
import './app.css'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app')! })
