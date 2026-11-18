// Titik masuk bundel: mengekspos Anthropic SDK resmi sebagai variabel global
// `Anthropic` agar bisa dipakai aplikasi tanpa bundler (juga dari file://).
import Anthropic from '@anthropic-ai/sdk';

globalThis.Anthropic = Anthropic;
