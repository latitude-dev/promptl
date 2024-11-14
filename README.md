## What is PromptL?

[PromptL](https://promptl.ai/) offers a common, easy-to-use syntax for defining dynamic prompts for LLMs. It is a simple, yet powerful language that allows you to define prompts in a human-readable format, while still being able to leverage the full power of LLMs.

## Why PromptL?

While LLMs are becoming more powerful and popular by the day, defining prompts for them can be a daunting task. All main LLM providers, despite their differences, have adopted a similar structure for their prompting. It consists of a conversation between the user and assistant, which is defined by a list of messages and a series of configuration options. In response, it will return an assistant message as a reply.

This structure looks something like this:

```json
{
  "model": "<your-model>",
  "temperature": 0.6,
  "messages": [
    {
      "type": "system",
      "content": "You are a useful AI assistant expert in geography."
    },
    {
      "type": "user",
      "content": "Hi! What's the capital of Spain?"
    }
  ]
}
```

This structure may be simple, but it can be tough for non-techy users to grasp or write it from scratch. In addition to this, creating a single static prompt is not that useful. Typically, users need to define conversations dynamically, where the flow changes based on user input or event parameters. The problem is, adding code to modify the conversation based on these parameters can get confusing and repetitive – it needs to be done for each prompt individually.

This is how the PromptL syntax steps in. It defines a language simple enough for any user to use and understand. And, at the same time, it offers immense power for users who want to maximize its potential. It allows users to define the same structure they would build before, but in a more readable way. Plus, they can add custom dynamic logic to create anything they need, all in just a single file.

Take a look at the same prompt as before, using the PromptL syntax:

```plaintext
---
model: <your-model>
temperature: 0.6
---

You are a useful AI assistant expert in geography.

<user>
  Hi! What's the capital of {{ country_name }}?
</user>
```

In this case, not only the syntax is way more readable and maintainable, but it also allows for dynamic generation of prompts by using variables like `{{ country_name }}`.

This is just a small example of what PromptL can do. It is a powerful tool that can help you define dynamic prompts for your LLMs in a simple and easy way, without giving up any feature or functionality from the original structure.

## Links

[Website](https://promptl.ai/) | [Documentation](https://docs.latitude.so/promptl/getting-started/introduction)